import { Navigate } from "@solidjs/router"
import Home from "@/pages/home"
import { desktopResumeHref, homeStays, isDesktopShell, resumeHref } from "@/utils/desktop-session"

export default function HomeEntry() {
  const href = resumeHref({ shell: isDesktopShell(), stay: homeStays(), href: desktopResumeHref() })
  if (href) return <Navigate href={href} />
  return <Home />
}
