package com.cognizant.adlc;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Two tiny builders so the orchestrator / agent can construct response trees
 * inline and readably: {@code obj("k", v, ...)} and {@code arr(...)}.
 */
public final class Dsl {

    private Dsl() {}

    /** Ordered map from alternating key/value pairs. */
    public static Map<String, Object> obj(Object... kv) {
        if (kv.length % 2 != 0) {
            throw new IllegalArgumentException("obj() needs key/value pairs");
        }
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return m;
    }

    /** Mutable list from items. */
    @SafeVarargs
    public static <T> List<T> arr(T... items) {
        return new ArrayList<>(List.of(items));
    }
}
