import { Navigate, Route, Routes } from "react-router";
import FieldTest from "./screens/FieldTest.tsx";
import Landing from "./screens/Landing.tsx";
import TillSetup from "./screens/TillSetup.tsx";
import WalletSetup from "./screens/WalletSetup.tsx";

/**
 * The first run, in order: what this is, then what this device is for. The
 * field test stays reachable while the till and wallet screens are built; it
 * is a working surface, not a product screen, and it is named as such.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/till/setup" element={<TillSetup />} />
      <Route path="/wallet/setup" element={<WalletSetup />} />
      <Route path="/field" element={<FieldTest />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
