package com.identityworksllc.iiq.plugins.queryplugin.tools;

import com.identityworksllc.iiq.plugins.queryplugin.QueryPluginResource;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import sailpoint.plugin.PluginsUtil;
import sailpoint.server.Environment;
import sailpoint.tools.IOUtil;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.net.URISyntaxException;
import java.net.URL;
import java.net.URLClassLoader;
import java.net.URLConnection;
import java.net.URLStreamHandler;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Allows loading of classes from a JAR file stored within a plugin
 */
public class EmbeddedJarClassloader extends URLClassLoader {

	private static final Log log = LogFactory.getLog(EmbeddedJarClassloader.class);

	/**
	 * The "internal" service JARs that need access to Groovy
	 */
	private static List<URL> internal;

	/**
	 * Constructs a magic in-memory URL scheme called 'x-mem' that represents the given URL structure
	 * @param name The name of the file
	 * @param originalInputStream The original resource input stream
	 * @return A fake URL pointing to this file
	 * @throws IOException if a failure occurs constructing the URL
	 */
	private static URL toFakeURL(final String name, final InputStream originalInputStream) throws IOException {
		final Map<String,byte[]> map = new HashMap<>();
		try(ZipInputStream is = new ZipInputStream(originalInputStream)) {
	        ZipEntry nextEntry = is.getNextEntry();
		    while(nextEntry != null) {
		        if (nextEntry.isDirectory()) {
			        nextEntry = is.getNextEntry();
		        	continue;
		        }

		        try(ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
		        	IOUtil.copy(is, baos);
		        	byte[] data = baos.toByteArray();
			        map.put("/" + nextEntry.getName(), data);
		        }
		        nextEntry = is.getNextEntry();
		    }
		}
		URL url = new URL("x-mem", name, -1, "/", new URLStreamHandler() {

			@Override
			protected URLConnection openConnection(URL u) throws IOException {
				String name = u.getFile();
				if (map.containsKey(name)) {
					final byte[] data = map.get(name);
					return new URLConnection(u) {
			            public void connect() throws IOException {}
			            @Override
			            public InputStream getInputStream() throws IOException {
			                return new ByteArrayInputStream(data);
			            }
			        };
				} else {
					throw new FileNotFoundException(u.getFile());
				}
			}
		} );
		log.warn("Inflated in-memory archive for dependency " + name);

		return url;
	}

	/**
	 * Basic class loader constructor
	 * @param parent The parent classloader
	 * @throws IOException If any of the files cannot be copied
	 * @throws URISyntaxException If any of the file URIs are invalid
	 */
	public EmbeddedJarClassloader(ClassLoader parent) throws IOException, URISyntaxException {
		super(new URL[0], parent);
		if (internal == null) {
			List<URL> internalJars = new ArrayList<>();
			try {
				byte[] inputJar = Environment.getEnvironment().getPluginsCache().getPluginFile(QueryPluginResource.PLUGIN_NAME, "JdbcConnectorAdapter.jxr");
				extractInternalArchive(internalJars, "JdbcConnectorAdapter.jxr", inputJar);
			} catch(Exception e) {
				log.error("Caught an error unzipping a file", e);
			}
			internal = internalJars;
		}
		for(URL url : internal) {
			super.addURL(url);
		}
	}
	
	/**
	 * Extracts the given JAR file from the classpath and adds it to this Classloader's own internal classpath
	 * @param internalJars The list to which the file should be added once extracted
	 * @param filename The filename to extract
	 * @throws IOException if a read failure occurs
	 */
	private void extractInternalArchive(List<URL> internalJars, String filename, byte[] data) throws IOException {
		try (InputStream resource = new ByteArrayInputStream(data)) {
			internalJars.add(toFakeURL(filename, resource));
		}
	}
	
	/**
	 * Performs a parent-last resource load so that we get our META-INF stuff properly
	 */
	@Override
	public InputStream getResourceAsStream(String name) {
		InputStream is = super.getResourceAsStream(name);
		if (is == null) {
			is = getParent().getResourceAsStream(name);
		}
		return is;
	}
	
	/**
	 * Performs a parent-last class load
	 */
	@Override
	public Class<?> loadClass(String name) throws ClassNotFoundException {
		try {
			if (this.findLoadedClass(name) != null) {
				return this.findLoadedClass(name);
			}
			return super.findClass(name);
		} catch(ClassNotFoundException e) {
			return getParent().loadClass(name);
		}
	}	
}
