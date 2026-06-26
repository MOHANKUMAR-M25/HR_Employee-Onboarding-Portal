package com.cognizant.adlc;

import java.util.List;
import java.util.Map;

/**
 * Tiny zero-dependency JSON helper.
 *
 * <p>Only does what this demo needs: serialise Maps / Lists / primitives to a
 * JSON string for responses, and pull a single flat string field out of a
 * request body. We deliberately avoid a JSON library so the backend compiles
 * and runs with nothing but the JDK on a conference laptop.
 */
public final class Json {

    private Json() {}

    /** Serialise any Map / List / String / Number / Boolean / null tree to JSON. */
    public static String write(Object value) {
        StringBuilder sb = new StringBuilder();
        encode(value, sb);
        return sb.toString();
    }

    private static void encode(Object value, StringBuilder sb) {
        switch (value) {
            case null -> sb.append("null");
            case String s -> quote(s, sb);
            case Boolean b -> sb.append(b);
            case Number n -> sb.append(n);
            case Map<?, ?> map -> {
                sb.append('{');
                boolean first = true;
                for (Map.Entry<?, ?> e : map.entrySet()) {
                    if (!first) sb.append(',');
                    first = false;
                    quote(String.valueOf(e.getKey()), sb);
                    sb.append(':');
                    encode(e.getValue(), sb);
                }
                sb.append('}');
            }
            case List<?> list -> {
                sb.append('[');
                boolean first = true;
                for (Object item : list) {
                    if (!first) sb.append(',');
                    first = false;
                    encode(item, sb);
                }
                sb.append(']');
            }
            default -> quote(value.toString(), sb);
        }
    }

    private static void quote(String s, StringBuilder sb) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        sb.append('"');
    }

    /**
     * Extract a single flat string field value from a small JSON request body,
     * e.g. fieldValue("{\"name\":\"Asha Rao\"}", "name") -> "Asha Rao".
     * Good enough for this demo's one-field requests; returns null if absent.
     */
    public static String fieldValue(String body, String field) {
        if (body == null) return null;
        int key = body.indexOf("\"" + field + "\"");
        if (key < 0) return null;
        int colon = body.indexOf(':', key);
        if (colon < 0) return null;
        int i = colon + 1;
        while (i < body.length() && Character.isWhitespace(body.charAt(i))) i++;
        if (i >= body.length() || body.charAt(i) != '"') return null;
        int start = i + 1;
        StringBuilder sb = new StringBuilder();
        for (int j = start; j < body.length(); j++) {
            char c = body.charAt(j);
            if (c == '\\' && j + 1 < body.length()) {
                sb.append(body.charAt(++j));
            } else if (c == '"') {
                return sb.toString();
            } else {
                sb.append(c);
            }
        }
        return null;
    }
}
