import { Heading } from "@/components/heading";
import Image from "next/image";
import {
  FaArrowRight,
  FaChartLine,
  FaCheckCircle,
  FaFile,
  FaLock,
} from "react-icons/fa";

const features: {
  title: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    title: "Online Data Submission",
    description:
      "Submit benchmarking data electronically through our secure online platform, replacing traditional email-based Excel submissions.",
    icon: <FaFile />,
  },
  {
    title: "Automated Validation",
    description:
      "Real-time validation checks ensure data accuracy and consistency, reducing errors and saving time.",
    icon: <FaCheckCircle />,
  },
  {
    title: "Interactive Analysis",
    description:
      "Compare your utility’s performance against peers with interactive charts, customizable views, and downloadable reports.",
    icon: <FaChartLine />,
  },
  {
    title: "Secure and Confidential",
    description:
      "Your data is protected with robust security measures, ensuring confidentiality and compliance with industry standards.",
    icon: <FaLock />,
  },
];

export default function Page() {
  return (
    <main className="min-h-screen bg-slate-50 selection:bg-slate-200">
      {/* Hero Section */}
      <section className="relative px-6 py-24 md:py-32 overflow-hidden flex flex-col items-center text-center bg-linear-to-b from-slate-50 to-white">
        <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px]"></div>

        <div className="relative z-10 max-w-4xl max-auto flex flex-col items-center">
          <Image
            src="/ppaLogo.png"
            alt="Pacific Power Association Logo"
            width={160}
            height={160}
            className="mb-8 drop-shadow-md"
            priority
          />

          <Heading
            level={1}
            className="text-4xl md:text-6xl font-extrabold text-slate-900 tracking-tight mb-4"
          >
            Pacific Power Association
          </Heading>
          <Heading
            level={2}
            className="text-2xl md:text-3xl font-medium text-slate-600 mb-8 max-w-2xl"
          >
            Online Benchmarking Data Platform
          </Heading>

          <p className="text-lg md:text-xl text-slate-600 max-w-2xl leading-relaxed mb-10">
            Streamlining utility benchmarking for member utilities with modern
            data collection and powerful analysis tools.
          </p>

          <a
            href="/auth"
            className="group relative inline-flex items-center justify-center gap-2 rounded-lg bg-slate-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-slate-500 hover:shadow-md transition-all duration-200 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-slate-600"
          >
            Sign In to Dashboard
            <span
              aria-hidden="true"
              className="group-hover:translate-x-1 transition-transform duration-200"
            >
              <FaArrowRight />
            </span>
          </a>
        </div>
      </section>

      {/* Features Grid Section */}
      <section className="px-6 py-16 max-w-7xl mx-auto -mt-16 relative z-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature) => (
            <div
              className="group bg-white border border-slate-100 p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              key={feature.title}
            >
              <div className="w-14 h-14 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center text-2xl mb-6 group-hover:scale-110 group-hover:bg-slate-600 group-hover:text-white transition-all duration-300">
                {feature.icon}
              </div>
              <Heading
                level={4}
                className="text-xl font-bold text-slate-900 mb-3"
              >
                {feature.title}
              </Heading>
              <p className="text-slate-600 leading-relaxed text-sm">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* About / History Section */}
      <section className="px-6 py-20 bg-white border-t border-slate-100">
        <div className="max-w-4xl mx-auto">
          <div className="mb-12 text-center">
            <h2 className="text-sm font-semibold text-slate-600 tracking-wider uppercase mb-3">
              Our History
            </h2>
            <Heading
              level={3}
              className="text-3xl md:text-4xl font-bold text-slate-900"
            >
              Modernizing Pacific Utility Benchmarking
            </Heading>
          </div>

          <div className="grid md:grid-cols-2 gap-10 md:gap-16 text-slate-600 leading-relaxed text-lg">
            <div className="space-y-6">
              <p>
                The PPA has been performing benchmarking studies for its member
                electric utilities every year since 2000, with the only
                exception being the period 2004 to 2009.
              </p>
              <p>
                Until now, the annual benchmarking report was prepared manually
                using MS Excel spreadsheets submitted through email. Data
                validation, analysis, and KPI calculations were performed
                manually, creating inefficiencies and timeline challenges for
                the PPA Secretariat in completing comprehensive studies.
              </p>
            </div>

            <div className="space-y-6">
              <p>
                This newly developed benchmarking platform enables utilities to
                submit data electronically through a secure online application
                designed specifically for Pacific Power Association member
                utilities.
              </p>
              <p className="font-medium text-slate-800 border-l-4 border-slate-500 pl-4 py-1">
                Utilities can now conduct their own benchmarking analysis
                online, while the PPA Secretariat can prepare the Annual
                Benchmarking Report more efficiently with automated tools and
                real-time data validation.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
