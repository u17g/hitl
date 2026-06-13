import type { CSSProperties, ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 } as CSSProperties}>{children}</body>
    </html>
  );
}
