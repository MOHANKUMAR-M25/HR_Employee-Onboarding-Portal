package com.cognizant.adlc;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Zero-dependency REST backend for the Cognizant Employee Onboarding portal,
 * built on the JDK's {@code com.sun.net.httpserver}. No Maven, no Gradle, no
 * frameworks — compiles and runs with a stock JDK.
 *
 * <p>Routes:
 * <pre>
 *   GET  /api/health         -> { status, service }
 *   POST /api/onboard        -> personalised onboarding plan
 *                              (body: a new-hire object: name + email required)
 *   GET/POST /api/onboarded  -> onboarding history (GET = CSV; POST = append a
 *                              candidate whose invitation was sent)
 *   GET/POST /api/removed    -> removed candidates (GET = CSV; POST = append one)
 *   GET/POST /api/candidates -> the working roster the onboarding page edits
 *                              (GET = CSV; POST = replace it with the CSV body)
 *   GET  /api/sample         -> the curated sample-new-hires.csv (so the
 *                              assistant's "import sample" reflects saved edits)
 * </pre>
 */
public final class Server {

    private static final AdlcAgent ADLC = new AdlcAgent();

    public static void main(String[] args) throws IOException {
        int port = port(args);
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);

        server.createContext("/api/health", wrap(ex ->
                json(ex, 200, Dsl.obj("status", "ok", "service", "cognizant-onboarding"))));

        server.createContext("/api/onboard", wrap(Server::onboard));
        server.createContext("/api/onboarded", wrap(Server::onboarded));
        server.createContext("/api/removed", wrap(Server::removed));
        server.createContext("/api/candidates", wrap(Server::candidates));
        server.createContext("/api/sample", wrap(Server::sample));

        server.setExecutor(null); // default executor is fine for this app
        server.start();
        System.out.println("Cognizant onboarding backend listening on http://localhost:" + port);
    }

    /**
     * The portal's onboarding endpoint. Accepts a new-hire object (captured by
     * the HR form or one row of an imported CSV/XLSX), then runs the onboarding
     * agent and returns the personalised plan.
     */
    private static void onboard(HttpExchange ex) throws IOException {
        if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
            json(ex, 405, Dsl.obj("error", "Use POST"));
            return;
        }
        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);

        Map<String, Object> hire = buildHire(body);
        if (hire == null) {
            json(ex, 400, Dsl.obj("error",
                    "Provide a new hire with at least a name and email."));
            return;
        }
        json(ex, 200, ADLC.run(hire));
    }

    /** CSV files for the onboarding history & removed-candidate audit trail. */
    private static final File ONBOARDED_FILE = new File("onboarded-candidates.csv").getAbsoluteFile();
    private static final File REMOVED_FILE = new File("removed-candidates.csv").getAbsoluteFile();
    private static final Object ONBOARDED_LOCK = new Object();
    private static final Object REMOVED_LOCK = new Object();
    private static final String ONBOARDED_HEADER =
            "Sent At,Full Name,Work Email,Job Title,Department,"
            + "Employment Type,Country,City,Region,Start Timing,Greeting";
    private static final String REMOVED_HEADER =
            "Removed At,Full Name,Work Email,Job Title,Department,"
            + "Employment Type,Country,City,Region,Start Timing,Greeting";

    /** The working candidate roster the onboarding page imports, edits and reloads. */
    private static final File CANDIDATES_FILE = new File("candidates.csv").getAbsoluteFile();
    private static final Object CANDIDATES_LOCK = new Object();
    private static final String CANDIDATES_HEADER =
            "Full Name,Work Email,Job Title,Department,"
            + "Employment Type,Country,City,Region,Start Timing,Greeting";

    /**
     * The curated sample roster at the repo root. The working roster is mirrored
     * here on every non-empty save so edits "reflect in sample-new-hires.csv",
     * but it is never wiped — a cleared/empty roster leaves the sample untouched.
     */
    private static final File SAMPLE_FILE = resolveSampleFile();

    /** Locate sample-new-hires.csv next to (or one level above) the backend's CWD. */
    private static File resolveSampleFile() {
        File cwd = CANDIDATES_FILE.getParentFile();
        File inCwd = new File(cwd, "sample-new-hires.csv");
        if (inCwd.isFile()) return inCwd;
        File parent = cwd.getParentFile();
        File inParent = parent != null ? new File(parent, "sample-new-hires.csv") : null;
        if (inParent != null && inParent.isFile()) return inParent;
        // Not present yet — default to the repo-root location (parent of backend/).
        return inParent != null ? inParent : inCwd;
    }

    /**
     * Onboarding history. GET returns the whole onboarded-candidates.csv (for the
     * dashboard); POST appends a candidate whose welcome invitation was sent.
     */
    private static void onboarded(HttpExchange ex) throws IOException {
        if ("GET".equalsIgnoreCase(ex.getRequestMethod())) {
            serveCsv(ex, ONBOARDED_FILE, ONBOARDED_HEADER);
            return;
        }
        if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
            json(ex, 405, Dsl.obj("error", "Use GET or POST"));
            return;
        }
        Map<String, Object> hire = buildHire(
                new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        if (hire == null) {
            json(ex, 400, Dsl.obj("error", "An onboarded candidate needs at least a name and email."));
            return;
        }
        appendRecord(ONBOARDED_FILE, ONBOARDED_LOCK, ONBOARDED_HEADER, hire);
        json(ex, 200, Dsl.obj("status", "stored", "file", ONBOARDED_FILE.getPath()));
    }

    /**
     * Removed candidates. GET returns the whole removed-candidates.csv (for the
     * dashboard); POST appends one who won't be onboarded (e.g. didn't join).
     */
    private static void removed(HttpExchange ex) throws IOException {
        if ("GET".equalsIgnoreCase(ex.getRequestMethod())) {
            serveCsv(ex, REMOVED_FILE, REMOVED_HEADER);
            return;
        }
        if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
            json(ex, 405, Dsl.obj("error", "Use GET or POST"));
            return;
        }
        Map<String, Object> hire = buildHire(
                new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        if (hire == null) {
            json(ex, 400, Dsl.obj("error", "A removed candidate needs at least a name and email."));
            return;
        }
        appendRecord(REMOVED_FILE, REMOVED_LOCK, REMOVED_HEADER, hire);
        json(ex, 200, Dsl.obj("status", "stored", "file", REMOVED_FILE.getPath()));
    }

    /**
     * The working candidate roster the onboarding page edits. GET returns the
     * whole candidates.csv (so a page refresh rehydrates the table); POST
     * replaces it with the posted CSV body — the frontend re-sends the roster
     * whenever it changes (import, add, edit, remove), so the file stays the
     * single source of truth.
     */
    private static void candidates(HttpExchange ex) throws IOException {
        if ("GET".equalsIgnoreCase(ex.getRequestMethod())) {
            serveCsv(ex, CANDIDATES_FILE, CANDIDATES_HEADER);
            return;
        }
        if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
            json(ex, 405, Dsl.obj("error", "Use GET or POST"));
            return;
        }
        String csv = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        saveRoster(csv);
        json(ex, 200, Dsl.obj("status", "saved", "file", CANDIDATES_FILE.getPath()));
    }

    /**
     * Serve the curated sample roster (sample-new-hires.csv). The assistant's
     * "import the sample" fetches this so it reflects edits mirrored back to the
     * file, rather than the copy bundled into the frontend at build time.
     */
    private static void sample(HttpExchange ex) throws IOException {
        if (!"GET".equalsIgnoreCase(ex.getRequestMethod())) {
            json(ex, 405, Dsl.obj("error", "Use GET"));
            return;
        }
        serveCsv(ex, SAMPLE_FILE, CANDIDATES_HEADER);
    }

    /**
     * Replace candidates.csv with the posted CSV text (empty body resets it to the
     * header only), and mirror the same roster into the curated sample file — but
     * only when it has at least one candidate, so a cleared roster never wipes the
     * sample ("mirror, never empty it").
     */
    private static void saveRoster(String csv) throws IOException {
        synchronized (CANDIDATES_LOCK) {
            String content = (csv == null || csv.isBlank()) ? CANDIDATES_HEADER + "\n" : csv;
            if (!content.endsWith("\n")) content += "\n";
            byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
            Files.write(CANDIDATES_FILE.toPath(), bytes,
                    StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING,
                    StandardOpenOption.WRITE);
            long rows = Math.max(0, content.lines().count() - 1); // minus the header line
            System.out.println("Saved roster (" + rows + " candidate row(s)) -> " + CANDIDATES_FILE.getName());

            if (rows > 0) {
                Files.write(SAMPLE_FILE.toPath(), bytes,
                        StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING,
                        StandardOpenOption.WRITE);
                System.out.println("Mirrored roster -> " + SAMPLE_FILE.getName());
            }
        }
    }

    /** Append one candidate as a CSV row (timestamp first), writing the header if new. */
    private static void appendRecord(File file, Object lock, String header, Map<String, Object> h)
            throws IOException {
        synchronized (lock) {
            boolean fresh = !file.exists() || file.length() == 0;
            StringBuilder sb = new StringBuilder();
            if (fresh) sb.append(header).append('\n');
            sb.append(csv(OffsetDateTime.now().toString())).append(',')
              .append(csv(h.get("name"))).append(',')
              .append(csv(h.get("email"))).append(',')
              .append(csv(h.get("title"))).append(',')
              .append(csv(h.get("department"))).append(',')
              .append(csv(h.get("employmentType"))).append(',')
              .append(csv(h.get("country"))).append(',')
              .append(csv(h.get("city"))).append(',')
              .append(csv(h.get("region"))).append(',')
              .append(csv(h.get("startTiming"))).append(',')
              .append(csv(h.get("greeting"))).append('\n');
            Files.write(file.toPath(), sb.toString().getBytes(StandardCharsets.UTF_8),
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            System.out.println("Recorded '" + h.get("name") + "' -> " + file.getName());
        }
    }

    /** Stream a CSV file back as text (or just the header line if it doesn't exist yet). */
    private static void serveCsv(HttpExchange ex, File file, String header) throws IOException {
        String content = (file.exists() && file.length() > 0)
                ? new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8)
                : header + "\n";
        byte[] out = content.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "text/csv; charset=utf-8");
        ex.sendResponseHeaders(200, out.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(out);
        }
    }

    /** Minimal CSV field escaping: quote when the value contains , " or newlines. */
    private static String csv(Object value) {
        String s = value == null ? "" : value.toString();
        if (s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r")) {
            return "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    /**
     * Build a hire record from the HR form's flat JSON fields. Returns null when
     * the minimum identity (name + email) is missing. Optional fields fall back
     * to sensible defaults so the agent always has a complete profile to plan on.
     */
    private static Map<String, Object> buildHire(String body) {
        String name = Json.fieldValue(body, "name");
        String email = Json.fieldValue(body, "email");
        if (isBlank(name) || isBlank(email)) {
            return null;
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", "custom-" + slug(name));
        m.put("name", name.trim());
        m.put("email", email.trim());
        m.put("title", orDefault(Json.fieldValue(body, "title"), "New Hire"));
        m.put("department", orDefault(Json.fieldValue(body, "department"), "General"));
        m.put("employmentType", orDefault(Json.fieldValue(body, "employmentType"), "FTE"));
        m.put("country", orDefault(Json.fieldValue(body, "country"), "—"));
        m.put("city", orDefault(Json.fieldValue(body, "city"), "—"));
        m.put("region", orDefault(Json.fieldValue(body, "region"), "NA"));
        m.put("startTiming", orDefault(Json.fieldValue(body, "startTiming"), "quarter-start"));
        m.put("greeting", orDefault(Json.fieldValue(body, "greeting"), "Dear"));
        return m;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String orDefault(String value, String fallback) {
        return isBlank(value) ? fallback : value.trim();
    }

    /** url/id-safe slug of a hire's name, e.g. "Asha N. Rao" -> "asha-n-rao". */
    private static String slug(String s) {
        String base = s.trim().toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
        return base.isEmpty() ? "hire" : base;
    }

    // ---- plumbing -----------------------------------------------------------

    /** Wraps a handler with CORS + OPTIONS preflight + error guard. */
    private static HttpHandler wrap(Handler handler) {
        return ex -> {
            ex.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
            ex.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            ex.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");
            if ("OPTIONS".equalsIgnoreCase(ex.getRequestMethod())) {
                ex.sendResponseHeaders(204, -1);
                ex.close();
                return;
            }
            try {
                handler.handle(ex);
            } catch (Exception e) {
                e.printStackTrace();
                try {
                    json(ex, 500, Dsl.obj("error", String.valueOf(e.getMessage())));
                } catch (IOException ignored) {
                    // response already committed
                }
            } finally {
                ex.close();
            }
        };
    }

    private static void json(HttpExchange ex, int status, Object payload) throws IOException {
        byte[] out = Json.write(payload).getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(status, out.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(out);
        }
    }

    private static int port(String[] args) {
        if (args.length > 0) {
            try {
                return Integer.parseInt(args[0]);
            } catch (NumberFormatException ignored) {
                // fall through to env / default
            }
        }
        String env = System.getenv("PORT");
        if (env != null) {
            try {
                return Integer.parseInt(env);
            } catch (NumberFormatException ignored) {
                // fall through to default
            }
        }
        return 8080;
    }

    /** Handler that may throw, so {@link #wrap} can centralise error handling. */
    @FunctionalInterface
    private interface Handler {
        void handle(HttpExchange ex) throws IOException;
    }
}
