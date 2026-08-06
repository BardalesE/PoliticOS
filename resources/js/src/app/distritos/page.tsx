import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { Districts } from "@/components/landing/Districts";

export const metadata = { title: "Lugares · PoliticOS" };

export default function DistrictsPage() {
  return (
    <main>
      <Navbar />
      <div><Districts /></div>
      <Footer />
    </main>
  );
}
