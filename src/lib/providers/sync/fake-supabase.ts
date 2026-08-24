/**
 * Un faux client Supabase, juste assez complet pour éprouver une
 * synchronisation de bout en bout.
 *
 * Il existe parce qu'un maillon manquait sans que rien ne le signale : le
 * relevé écrivait les scores, émettait ses événements, renvoyait un rapport en
 * succès — et ne distribuait aucun point. Les tests unitaires des fonctions
 * pures ne pouvaient pas le voir : le défaut n'était pas dans un calcul, il
 * était dans un *appel absent*. Seul un test qui traverse la chaîne le
 * démasque.
 *
 * Ce n'est pas une émulation de PostgreSQL. Les filtres sont appliqués sur des
 * tableaux en mémoire, dans le seul dialecte que le code de synchronisation
 * utilise réellement. Toute écriture est conservée et relisible : c'est là que
 * les tests vont vérifier ce qui s'est passé.
 */

type Row = Record<string, unknown>;

export interface FakeDb {
  [table: string]: Row[];
}

/** Ce qu'un test veut inspecter après coup. */
export interface FakeWrites {
  inserts: { table: string; rows: Row[] }[];
  updates: { table: string; patch: Row; where: Row }[];
  deletes: { table: string; where: Row }[];
}

interface Filter {
  op: "eq" | "in" | "gte" | "lte" | "not" | "is";
  column: string;
  value: unknown;
}

function valueAt(row: Row, column: string): unknown {
  // `rounds.season_id` : le code filtre sur une jointure. Les lignes du faux
  // portent la colonne à plat, on accepte donc les deux écritures.
  if (column in row) return row[column];
  const flat = column.split(".").pop();
  return flat ? row[flat] : undefined;
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const actual = valueAt(row, f.column);
    switch (f.op) {
      case "eq": return actual === f.value;
      case "in": return Array.isArray(f.value) && f.value.includes(actual);
      case "gte": return String(actual) >= String(f.value);
      case "lte": return String(actual) <= String(f.value);
      case "is": return actual === f.value;
      // `.not(col, "is", null)` : la seule négation employée par le code.
      case "not": return actual !== null && actual !== undefined;
    }
  });
}

// Plusieurs paramètres ne servent qu'à épouser la signature de Supabase :
// le code appelant les passe, ce faux les ignore. Les nommer reste plus
// lisible qu'un `...args` qui masquerait ce que l'appelant croit transmettre.
/* eslint-disable @typescript-eslint/no-unused-vars */
class Query implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitTo: number | null = null;
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: Row[] = [];
  private patch: Row = {};

  private table: string;
  private db: FakeDb;
  private writes: FakeWrites;

  // Champs déclarés puis assignés : les propriétés de constructeur exigeraient
  // une transformation, là où Node se contente de retirer les types.
  constructor(table: string, db: FakeDb, writes: FakeWrites) {
    this.table = table;
    this.db = db;
    this.writes = writes;
  }

  select(_columns?: string) { if (this.mode === "select") this.mode = "select"; return this; }
  eq(column: string, value: unknown) { this.filters.push({ op: "eq", column, value }); return this; }
  in(column: string, value: unknown[]) { this.filters.push({ op: "in", column, value }); return this; }
  gte(column: string, value: unknown) { this.filters.push({ op: "gte", column, value }); return this; }
  lte(column: string, value: unknown) { this.filters.push({ op: "lte", column, value }); return this; }
  is(column: string, value: unknown) { this.filters.push({ op: "is", column, value }); return this; }
  not(column: string, _op: string, _value: unknown) { this.filters.push({ op: "not", column, value: null }); return this; }
  order(column: string, opts?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: opts?.ascending !== false };
    return this;
  }
  limit(n: number) { this.limitTo = n; return this; }

  insert(rows: Row | Row[]) {
    this.mode = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], _opts?: unknown) {
    this.mode = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row) { this.mode = "update"; this.patch = patch; return this; }
  delete() { this.mode = "delete"; return this; }

  /* eslint-enable @typescript-eslint/no-unused-vars */

  private rows(): Row[] {
    const table = this.db[this.table] ?? [];
    let found = table.filter((r) => matches(r, this.filters));
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      found = [...found].sort((a, b) => {
        const x = String(valueAt(a, column) ?? "");
        const y = String(valueAt(b, column) ?? "");
        return ascending ? x.localeCompare(y) : y.localeCompare(x);
      });
    }
    if (this.limitTo !== null) found = found.slice(0, this.limitTo);
    return found;
  }

  private run(): { data: unknown; error: null } {
    const table = (this.db[this.table] ??= []);

    switch (this.mode) {
      case "insert":
      case "upsert": {
        // Un identifiant est attribué s'il manque : `openRun` relit le sien.
        const stamped = this.payload.map((r, i) => ({
          id: r.id ?? `${this.table}-${table.length + i + 1}`,
          ...r,
        }));
        table.push(...stamped);
        this.writes.inserts.push({ table: this.table, rows: stamped });
        return { data: stamped, error: null };
      }
      case "update": {
        const touched = table.filter((r) => matches(r, this.filters));
        for (const row of touched) Object.assign(row, this.patch);
        this.writes.updates.push({
          table: this.table,
          patch: this.patch,
          where: Object.fromEntries(this.filters.map((f) => [f.column, f.value])),
        });
        return { data: touched, error: null };
      }
      case "delete": {
        const kept = table.filter((r) => !matches(r, this.filters));
        this.db[this.table] = kept;
        this.writes.deletes.push({
          table: this.table,
          where: Object.fromEntries(this.filters.map((f) => [f.column, f.value])),
        });
        return { data: null, error: null };
      }
      default:
        return { data: this.rows(), error: null };
    }
  }

  single() {
    const { data } = this.run();
    const rows = Array.isArray(data) ? data : [];
    return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: "aucune ligne" } });
  }
  maybeSingle() {
    const { data } = this.run();
    const rows = Array.isArray(data) ? data : [];
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  then<R1 = { data: unknown; error: null }, R2 = never>(
    onfulfilled?: ((v: { data: unknown; error: null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export function fakeSupabase(seed: FakeDb = {}) {
  const db: FakeDb = JSON.parse(JSON.stringify(seed));
  const writes: FakeWrites = { inserts: [], updates: [], deletes: [] };

  return {
    db,
    writes,
    /** Les lignes écrites dans une table, tous appels confondus. */
    inserted(table: string): Row[] {
      return writes.inserts.filter((i) => i.table === table).flatMap((i) => i.rows);
    },
    client: {
      from(table: string) {
        return new Query(table, db, writes);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}
