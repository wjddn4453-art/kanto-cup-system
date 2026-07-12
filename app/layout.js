import './globals.css';

export const metadata = {
  title: '고추밭 실시간 경매',
  description: '고추밭 롤 대회 실시간 경매 시스템'
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
