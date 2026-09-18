import { PlatformLanding } from "@/components/platform/PlatformLanding";
import { PLATFORM_METADATA } from "@/components/platform/metadata";

// Home de la plataforma, siempre disponible (incluso en despliegues que fijan
// NEXT_PUBLIC_TENANT_SLUG y por eso muestran la home de un candidato en "/").
export const metadata = PLATFORM_METADATA;

export default function InicioPage() {
  return <PlatformLanding />;
}
