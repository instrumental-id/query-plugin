package com.identityworksllc.iiq.plugins.queryplugin;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Map;

public class QueryPluginUtil {
    public static <T> T decodeMap(Map<String, Object> json, Class<T> expectedType) {
        ObjectMapper mapper = new ObjectMapper();
        return mapper.convertValue(json, expectedType);
    }
}
