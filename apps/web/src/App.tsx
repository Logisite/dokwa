import { Navigate, Route, Routes } from "react-router";
import { UpdatePrompt } from "./components/UpdatePrompt.tsx";
import FieldTest from "./screens/FieldTest.tsx";
import Landing from "./screens/Landing.tsx";
import PracticeScreen from "./screens/Practice.tsx";
import Records from "./screens/Records.tsx";
import Scan from "./screens/Scan.tsx";
import Till from "./screens/Till.tsx";
import TillSetup from "./screens/TillSetup.tsx";
import Wallet from "./screens/Wallet.tsx";
import WalletSetup from "./screens/WalletSetup.tsx";

/**
 * The first run, in order: what this is, then what this device is for. The
 * field test stays reachable while the screens are verified; it is a working
 * surface, not a product screen, and it is named as such.
 */
export default function App() {
  return (
    <>
      <UpdatePrompt />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/till" element={<Till />} />
        <Route path="/till/setup" element={<TillSetup />} />
        <Route path="/records" element={<Records />} />
        <Route path="/practice" element={<PracticeScreen />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/wallet/setup" element={<WalletSetup />} />
        <Route path="/field" element={<FieldTest />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
