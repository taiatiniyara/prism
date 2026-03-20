export default function DocsHomePage() {
  return (
    <div>
      <iframe
        src={"/glossary.pdf"}
        style={{ border: "none", height: "calc(100vh - 64px)", width: "100%" }}
      />
    </div>
  );
}
