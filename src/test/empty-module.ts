// Stub vazio para o vitest aliasar `server-only` (e similares): em teste, o
// guard server-only é um no-op. Evita repetir `vi.mock("server-only")` em todo
// arquivo que importa transitivamente um módulo server-only.
export {}
