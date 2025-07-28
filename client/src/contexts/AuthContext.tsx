import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface AuthContextType {
  isAuthenticated: boolean;
  user: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is already authenticated on app load
    const authStatus = sessionStorage.getItem("isAuthenticated");
    const storedUser = sessionStorage.getItem("user");
    
    if (authStatus === "true" && storedUser) {
      setIsAuthenticated(true);
      setUser(storedUser);
    } else {
      // If no valid session, ensure user is logged out
      setIsAuthenticated(false);
      setUser(null);
    }
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    // Hardcoded credentials
    const VALID_USERNAME = "admin";
    const VALID_PASSWORD = "pwc2024";

    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
      sessionStorage.setItem("isAuthenticated", "true");
      sessionStorage.setItem("user", username);
      setIsAuthenticated(true);
      setUser(username);
      return true;
    }
    return false;
  };

  const logout = () => {
    sessionStorage.removeItem("isAuthenticated");
    sessionStorage.removeItem("user");
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
} 