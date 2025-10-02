"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryRoutes = void 0;
const express_1 = require("express");
const controllers_1 = require("../controllers");
const router = (0, express_1.Router)();
exports.queryRoutes = router;
const sessionController = new controllers_1.SessionController();
// POST /query - Consultar sesiones con filtros
router.post('/', sessionController.query);
