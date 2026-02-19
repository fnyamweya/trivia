import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email?: string;
  displayName?: string;
  role: 'teacher' | 'student';
}

interface StudentSession {
  id: string;
  name: string;
  status: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  studentSession: StudentSession | null;

  setTeacherAuth: (data: { accessToken: string; user: { id: string; email: string; displayName: string } }) => void;
  setStudentAuth: (data: { accessToken: string; session: { id: string; name: string; status: string }; student: { id: string; nickname: string } }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      studentSession: null,

      setTeacherAuth: (data) => {
        set({
          user: {
            id: data.user.id,
            email: data.user.email,
            displayName: data.user.displayName,
            role: 'teacher',
          },
          accessToken: data.accessToken,
          studentSession: null,
        });
        localStorage.setItem('accessToken', data.accessToken);
      },

      setStudentAuth: (data) => {
        set({
          user: {
            id: data.student.id,
            displayName: data.student.nickname,
            role: 'student',
          },
          accessToken: data.accessToken,
          studentSession: {
            id: data.session.id,
            name: data.session.name,
            status: data.session.status,
          },
        });
        localStorage.setItem('accessToken', data.accessToken);
      },

      logout: () => {
        localStorage.removeItem('accessToken');
        set({
          user: null,
          accessToken: null,
          studentSession: null,
        });
      },
    }),
    {
      name: 'trivia-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        studentSession: state.studentSession,
      }),
    }
  )
);
