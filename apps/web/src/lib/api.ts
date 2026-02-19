import axios from 'axios';

// Create axios instance with default config
export const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 - clear auth and redirect
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// Type-safe API methods
export const authApi = {
  teacherLogin: (email: string) =>
    api.post<{ token: string; user: any }>('/auth/teacher/login', { email }),

  studentJoin: (joinCode: string, nickname: string) =>
    api.post<{ token: string; session: any; student: any; team: any }>(
      '/auth/student/join',
      { joinCode, nickname }
    ),
};

export const sessionsApi = {
  list: (cursor?: string) =>
    api.get('/sessions', { params: { cursor } }),

  get: (id: string) =>
    api.get(`/sessions/${id}`),

  create: (data: { name: string; topicId?: string; rulesetId?: string }) =>
    api.post('/sessions', data),

  update: (id: string, data: { status?: string }) =>
    api.patch(`/sessions/${id}`, data),

  getStudents: (id: string) =>
    api.get(`/sessions/${id}/students`),

  getEvents: (id: string) =>
    api.get(`/sessions/${id}/events`),
};

export const questionsApi = {
  list: (params?: { topicId?: string; cursor?: string }) =>
    api.get('/questions', { params }),

  get: (id: string) =>
    api.get(`/questions/${id}`),

  create: (data: any) =>
    api.post('/questions', data),

  update: (id: string, data: any) =>
    api.put(`/questions/${id}`, data),

  delete: (id: string) =>
    api.delete(`/questions/${id}`),
};

export const topicsApi = {
  list: () => api.get('/topics'),
  create: (data: { name: string; description?: string }) =>
    api.post('/topics', data),
};

export const tagsApi = {
  list: () => api.get('/tags'),
  create: (data: { name: string }) =>
    api.post('/tags', data),
};

export const reportsApi = {
  getTeacherRecent: () =>
    api.get('/reports/teacher/recent'),

  getSessionSummary: (sessionId: string) =>
    api.get(`/reports/sessions/${sessionId}/summary`),

  getSessionLeaderboard: (sessionId: string) =>
    api.get(`/reports/sessions/${sessionId}/leaderboard`),

  getStudentSummary: (sessionId: string) =>
    api.get(`/reports/sessions/${sessionId}/student`),
};
