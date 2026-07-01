export const metadata = {
  title: 'Sanity Studio',
  description: 'Admin dashboard for RJ Client',
}

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
