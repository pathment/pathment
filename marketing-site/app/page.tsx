import { DeepFeatures } from '../components/landing/DeepFeatures';
import { FAQ } from '../components/landing/FAQ';
import { Features } from '../components/landing/Features';
import { FinalCta } from '../components/landing/FinalCta';
import { Footer } from '../components/landing/Footer';
import { Hero } from '../components/landing/Hero';
import { LogoMarquee } from '../components/landing/LogoMarquee';
import { Workflow } from '../components/landing/Workflow';
import { Navbar } from '../components/landing/Navbar';
import { Solutions } from '../components/landing/Solutions';
import { Testimonials } from '../components/landing/Testimonials';

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <LogoMarquee />
        <Solutions />
        <Features />
        <DeepFeatures />
        <Workflow />
        <Testimonials />
        <FAQ />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
