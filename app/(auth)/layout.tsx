// The sign-in screen owns its full-page layout (brand panel + form).
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <div className="min-h-svh bg-background">{children}</div>;
}
