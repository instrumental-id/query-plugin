package com.identityworksllc.iiq.plugins.queryplugin.reporting.vo;

import sailpoint.object.Argument;

public class ArgumentSpec {
    private String name;
    private String prompt;
    private String type;

    public Argument asArgument() {
        Argument arg = new Argument();
        arg.setPrompt(prompt);
        arg.setName(name);
        arg.setDisplayName(name);
        arg.setType(type);
        return arg;
    }

    public String getName() {
        return name;
    }

    public String getPrompt() {
        return prompt;
    }

    public String getType() {
        return type;
    }

    public void setName(String name) {
        this.name = name;
    }

    public void setPrompt(String prompt) {
        this.prompt = prompt;
    }

    public void setType(String type) {
        this.type = type;
    }
}
