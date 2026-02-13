import "./globals.css";
import { AuthProvider } from '../context/auth-context';
import { LanguageProvider } from '../context/language-context';
import ClientProviders from '@/components/ClientProviders';

export const metadata = {
  title: 'FootGolf Total',
  description: 'App para socios de FootGolf',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" data-scroll-behavior="smooth">
      <body style={{ margin: 0, padding: 0, width: '100%', height: '100%' }}>
        <AuthProvider>
          <LanguageProvider>
            <ClientProviders>
              {children}
            </ClientProviders>
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}