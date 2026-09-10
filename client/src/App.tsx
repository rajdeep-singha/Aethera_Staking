import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { WalletProvider } from "./WalletProvider";

import Landing from "./pages/Landing";
import InstallerPortal from "./pages/installer/InstallerPortal";
import Locations from "./pages/investor/Locations";
import Projects from "./pages/investor/Projects";
import ProjectStake from "./pages/investor/ProjectStake";
import ProjectTrade from "./pages/investor/ProjectTrade";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";

export default function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />

          {/* Installer */}
          <Route path="/installer" element={<InstallerPortal />} />

          {/* Investor */}
          <Route path="/invest" element={<Locations />} />
          <Route path="/invest/location/:locationId" element={<Projects />} />
          <Route path="/invest/project/:projectId" element={<ProjectStake />} />
          <Route path="/invest/project/:projectId/trade" element={<ProjectTrade />} />

          {/* Admin */}
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  );
}