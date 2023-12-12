package com.identityworksllc.iiq.plugins.queryplugin.tools;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.type.TypeFactory;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import sailpoint.tools.GeneralException;
import sailpoint.tools.Util;

import javax.ws.rs.Consumes;
import javax.ws.rs.WebApplicationException;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.MultivaluedMap;
import javax.ws.rs.ext.MessageBodyReader;
import javax.ws.rs.ext.Provider;
import java.io.IOException;
import java.io.InputStream;
import java.lang.annotation.Annotation;
import java.lang.reflect.Type;

@Provider
@Consumes(MediaType.APPLICATION_JSON)
public class QueryPluginMessageBodyReader implements MessageBodyReader<Object> {
    private static final Log log = LogFactory.getLog(QueryPluginMessageBodyReader.class);

    @Override
    public boolean isReadable(Class<?> type, Type genericType, Annotation[] annotations, MediaType mediaType) {
        if (log.isTraceEnabled()) {
            log.trace("Checking whether we can decode into type " + type.getName());
        }
        return type.getName().startsWith("com.identityworksllc.iiq");
    }

    @Override
    public Object readFrom(Class<Object> type, Type genericType, Annotation[] annotations, MediaType mediaType, MultivaluedMap<String, String> httpHeaders, InputStream entityStream) throws IOException, WebApplicationException {
        if (log.isDebugEnabled()) {
            log.debug("Reading message body into type " + type.getName());
        }

        try {
            try {
                String json = Util.readInputStream(entityStream);

                ObjectMapper om = new ObjectMapper();
                TypeFactory tf = TypeFactory.defaultInstance().withClassLoader(type.getClassLoader());
                om.setTypeFactory(tf);

                return om.readValue(json, type);
            } catch(IOException e) {
                log.error("Caught an error reading JSON object");
                throw e;
            }
        } catch(GeneralException e) {
            throw new IOException(e);
        }
    }
}
