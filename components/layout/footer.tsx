export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <div className="p-3 text-xs font-medium border-t text-slate-600">
      <p className="w-full text-center">
        Copyright &copy; {year}{" "}
        <a
          href="https://www.ppa.org.fj/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-slate-900"
        >
          Pacific Power Association
        </a>
        . All rights reserved.
      </p>
    </div>
  );
}
