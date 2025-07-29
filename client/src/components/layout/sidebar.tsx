import { Link, useLocation } from "wouter";
import { Shield, Gauge, Search, ShieldQuestion, FileText, Phone, LogOut, User, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const navigation = [
  { name: "Anomaly Detection", href: "/anomaly-detection", icon: Search },
  { name: "Fraud Detection", href: "/fraud-detection", icon: ShieldQuestion },
  { name: "Real-Time Threat Dashboard", href: "/", icon: Gauge },
  { name: "Data Import", href: "/data-import", icon: Upload },
  // { name: "Compliance Reports", href: "/compliance-reports", icon: FileText },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const handleSignOut = () => {
    logout();
    // The AuthContext will handle the redirect to login
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex-shrink-0 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3 mb-4">
          {/* PWC Logo */}
          <div className="w-16 h-12 flex items-center justify-center">
            <img src="/pwcLogo.png" alt="PwC Logo"/>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center pwc-button-primary">
            <Shield className="text-white text-xl" size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">TelecomSOC</h1>
            <p className="text-sm text-gray-600">AI Security Platform</p>
          </div>
        </div>
      </div>
      
      <nav className="flex-1 mt-6">
        <div className="px-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Dashboard</p>
          <ul className="space-y-2">
            {navigation.map((item) => {
              const isActive = location === item.href;
              return (
                <li key={item.name}>
                  <Link href={item.href} className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                    isActive
                      ? "text-white pwc-button-primary"
                      : "text-gray-700 hover:bg-gray-100"
                  )}>
                    <item.icon className="mr-3" size={18} />
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* User Info and Sign Out */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <User className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user || "User"}
            </p>
            <p className="text-xs text-gray-500">Administrator</p>
          </div>
        </div>
        <Button
          onClick={handleSignOut}
          variant="outline"
          size="sm"
          className="w-full text-gray-700 hover:text-red-600 hover:border-red-300"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
