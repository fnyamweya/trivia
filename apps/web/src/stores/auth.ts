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
  joinCode: string;
  team: { id: string; name: string };
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  studentSession: StudentSession | null;

  setTeacherAuth: (data: { token: string; user: any }) => void;
  setStudentAuth: (data: { token: string; session: any; student: any; team: any }) => void;
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
          accessToken: data.token,
          studentSession: null,
        });
        localStorage.setItem('accessToken', data.token);
      },

      setStudentAuth: (data) => {
        set({
          user: {
            id: data.student.id,
            displayName: data.student.nickname,
            role: 'student',
          },
          accessToken: data.token,
          studentSession: {
            id: data.session.id,
            joinCode: data.session.joinCode,
            team: data.team,
          },
        });
        localStorage.setItem('accessToken', data.token);
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
