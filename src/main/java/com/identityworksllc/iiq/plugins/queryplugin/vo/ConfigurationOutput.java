package com.identityworksllc.iiq.plugins.queryplugin.vo;

import com.fasterxml.jackson.annotation.JsonAutoDetect;

import java.util.ArrayList;
import java.util.List;

@JsonAutoDetect(getterVisibility = JsonAutoDetect.Visibility.PUBLIC_ONLY)
public class ConfigurationOutput {

    @JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY)
    public static class Privileges {
        public boolean queryApplications;
        public boolean saveReports;

    }

    private List<String> applications;

    private Privileges privileges;

    public ConfigurationOutput() {
        this.privileges = new Privileges();
        this.applications = new ArrayList<>();
    }

    public List<String> getApplications() {
        return applications;
    }

    public Privileges getPrivileges() {
        return privileges;
    }

    public void setApplications(List<String> applications) {
        this.applications = applications;
    }

    public void setPrivileges(Privileges privileges) {
        this.privileges = privileges;
    }
}
