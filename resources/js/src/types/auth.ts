export type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "editor";
};

export type AuthState = {
  user: AdminUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
};
