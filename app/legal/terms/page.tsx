import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata = { title: "Terms of Service" };

export default function Page() {
  return (
    <>
      <Header variant="light" />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-32">
        <h1 className="font-display text-4xl font-semibold">Terms of Service</h1>
        <p className="mt-6 text-slate-500">Placeholder. Replace with Averiqo's reviewed legal text before launch.</p>
      </main>
      <Footer />
    </>
  );
}
