import { Pool } from 'pg';
import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const migrations = [
  {
    name: '001_initial_schema',
    sql: `
      -- Crear extensiones necesarias
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "btree_gin";

      -- Enum para estados de sesión
      DO $$ BEGIN
        CREATE TYPE session_state AS ENUM ('active', 'completed', 'error');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      -- Tabla de sesiones
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE,
        state session_state NOT NULL DEFAULT 'active',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabla de detecciones
      CREATE TABLE IF NOT EXISTS detections (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        class_name VARCHAR(100) NOT NULL,
        confidence DECIMAL(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
        bounding_box JSONB NOT NULL,
        attributes JSONB DEFAULT '{}',
        enriched_attributes JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Índices para sesiones
      CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
      CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_metadata ON sessions USING GIN (metadata);
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);

      -- Índices para detecciones
      CREATE INDEX IF NOT EXISTS idx_detections_session_id ON detections(session_id);
      CREATE INDEX IF NOT EXISTS idx_detections_timestamp ON detections(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_detections_class_name ON detections(class_name);
      CREATE INDEX IF NOT EXISTS idx_detections_confidence ON detections(confidence DESC);
      CREATE INDEX IF NOT EXISTS idx_detections_attributes ON detections USING GIN (attributes);
      CREATE INDEX IF NOT EXISTS idx_detections_enriched_attributes ON detections USING GIN (enriched_attributes);
      CREATE INDEX IF NOT EXISTS idx_detections_session_timestamp ON detections(session_id, timestamp DESC);

      -- Trigger para actualizar updated_at automáticamente
      CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      CREATE TRIGGER update_sessions_updated_at
        BEFORE UPDATE ON sessions
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_detections_updated_at
        BEFORE UPDATE ON detections
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `
  }
];

async function runMigrations() {
  const client = await pool.connect();
  
  try {
    console.log('🗄️  Ejecutando migraciones de base de datos...');
    
    // Crear tabla de migraciones si no existe
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Verificar qué migraciones ya se han ejecutado
    const { rows: executedMigrations } = await client.query(
      'SELECT name FROM migrations ORDER BY executed_at'
    );
    
    const executedNames = new Set(executedMigrations.map(row => row.name));
    
    // Ejecutar migraciones pendientes
    for (const migration of migrations) {
      if (!executedNames.has(migration.name)) {
        console.log(`📝 Ejecutando migración: ${migration.name}`);
        
        await client.query('BEGIN');
        
        try {
          await client.query(migration.sql);
          await client.query(
            'INSERT INTO migrations (name) VALUES ($1)',
            [migration.name]
          );
          
          await client.query('COMMIT');
          console.log(`✅ Migración ${migration.name} completada`);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      } else {
        console.log(`⏭️  Migración ${migration.name} ya ejecutada, omitiendo`);
      }
    }
    
    // Verificar el estado de las tablas
    const tablesResult = await client.query(`
      SELECT schemaname, tablename, tableowner 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('sessions', 'detections', 'migrations')
      ORDER BY tablename;
    `);
    
    console.log('\n📊 Tablas creadas:');
    tablesResult.rows.forEach(row => {
      console.log(`  ✓ ${row.tablename}`);
    });
    
    // Mostrar estadísticas
    const sessionCount = await client.query('SELECT COUNT(*) FROM sessions');
    const detectionCount = await client.query('SELECT COUNT(*) FROM detections');
    
    console.log('\n📈 Estadísticas actuales:');
    console.log(`  🎯 Sesiones: ${sessionCount.rows[0].count}`);
    console.log(`  🔍 Detecciones: ${detectionCount.rows[0].count}`);
    
    console.log('\n✅ Migraciones completadas exitosamente!');
    
  } catch (error) {
    console.error('❌ Error ejecutando migraciones:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('🎉 Base de datos lista para usar');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Error fatal:', error);
      process.exit(1);
    });
}

export { runMigrations };