import { landingFontVariables } from '@/lib/landingFonts';
import '../landing.css';

/** The home page has its own navigation and footer (components/landing). */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`v3 ${landingFontVariables}`}>{children}</div>;
}
