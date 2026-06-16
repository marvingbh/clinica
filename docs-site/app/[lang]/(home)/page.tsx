import Link from "next/link";

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const docsHref = lang === "en" ? "/en/docs" : "/docs";

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-3 text-3xl font-bold">Documentação do Clinica</h1>
      <p className="mb-6 max-w-xl text-fd-muted-foreground">
        Guia completo do sistema de gestão de clínicas: agenda, prontuário,
        financeiro, fiscal, portal do paciente e muito mais.
      </p>
      <Link
        href={docsHref}
        className="rounded-md bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground"
      >
        Abrir a documentação
      </Link>
    </main>
  );
}
