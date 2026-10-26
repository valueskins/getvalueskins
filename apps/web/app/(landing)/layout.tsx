import '../landing.css';

/** The home page has its own navigation (components/landing); the fonts and tokens are the app's. */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <div className="v3">{children}</div>;
}
