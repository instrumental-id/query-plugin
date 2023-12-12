package com.identityworksllc.iiq.plugins.queryplugin.tools;

import sailpoint.connector.ConnectorClassLoaderUtil;
import sailpoint.object.Application;
import sailpoint.server.Environment;

import java.io.InputStream;

/**
 * A custom ClassLoader which merges the classloaders of a plugin and an
 * application, making objects from both accessible to the same code.
 */
public class PluginConnectorClassloader extends ClassLoader {

    private final ClassLoader connectorClassloader;
    private final ClassLoader pluginClassloader;

    /**
     * Constructor where you already have two classloader objects
     *
     * @param pluginClassloader The plugin classloader
     * @param connectorClassloader The connector classloader
     */
    public PluginConnectorClassloader(ClassLoader pluginClassloader, ClassLoader connectorClassloader) {
        this.pluginClassloader = pluginClassloader;
        this.connectorClassloader = connectorClassloader;
    }

    /**
     * Easier constructor, taking in the plugin name and the Application. The classloaders
     * will be dynamically retrieved using IIQ's APIs.
     *
     * @param pluginName The name of the plugin
     * @param application The application for which to retrieve a connector classloader
     */
    public PluginConnectorClassloader(String pluginName, Application application) {
        this.pluginClassloader = Environment.getEnvironment().getPluginsCache().getClassLoader(pluginName);
        this.connectorClassloader = ConnectorClassLoaderUtil.getConnectorClassLoader(application);
    }

    /**
     * Finds the class by name. If the class starts with sailpoint.connector, openconnector,
     * or connector, then the connector classloader is used. Otherwise, the plugin classloader
     * is used.
     *
     * @param name
     *         The <a href="#name">binary name</a> of the class
     *
     * @return The class, if it exists
     * @throws ClassNotFoundException if the class cannot be found in the relevant classloader
     */
    @Override
    protected Class<?> findClass(String name) throws ClassNotFoundException {
        if (name.startsWith("com.identityworksllc")) {
            return pluginClassloader.loadClass(name);
        } else {
            return connectorClassloader.loadClass(name);
        }
    }

    @Override
    public InputStream getResourceAsStream(String name) {
        if (name.contains("identityworksllc")) {
            return pluginClassloader.getResourceAsStream(name);
        } else {
            return connectorClassloader.getResourceAsStream(name);
        }
    }
}
