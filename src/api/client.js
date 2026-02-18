import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api/v1'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

export const apiClient = {
  getModels: () => api.get('/models'),
  reloadModels: () => api.post('/models/reload'),

  listGroups: () => api.get('/groups'),
  getGroup: (id) => api.get(`/groups/${id}`),
  createGroup: (payload) => api.post('/groups', payload),
  deleteGroup: (id) => api.delete(`/groups/${id}`),

  addMember: (groupId, payload) => api.post(`/groups/${groupId}/members`, payload),
  updateMember: (groupId, memberId, payload) => api.patch(`/groups/${groupId}/members/${memberId}`, payload),
  removeMember: (groupId, memberId) => api.delete(`/groups/${groupId}/members/${memberId}`),

  setManager: (groupId, payload) => api.put(`/groups/${groupId}/manager`, payload),

  getMessages: (groupId, limit = 200) => api.get(`/groups/${groupId}/messages`, { params: { limit } }),
  getContextStats: (groupId) => api.get(`/groups/${groupId}/context/stats`),
  setThreshold: (groupId, payload) => api.put(`/groups/${groupId}/compression/threshold`, payload),
}

export const apiBase = API_BASE
