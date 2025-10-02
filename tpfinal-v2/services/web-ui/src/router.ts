import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '@/views/Dashboard.vue'
import SessionDetail from '@/views/SessionDetail.vue'
import LiveStream from '@/views/LiveStream.vue'

export const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    {
      path: '/',
      name: 'Dashboard',
      component: Dashboard
    },
    {
      path: '/session/:id',
      name: 'SessionDetail',
      component: SessionDetail,
      props: true
    },
    {
      path: '/live',
      name: 'LiveStream',
      component: LiveStream
    }
  ]
})