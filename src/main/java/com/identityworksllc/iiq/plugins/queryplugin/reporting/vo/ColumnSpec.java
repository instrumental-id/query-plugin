package com.identityworksllc.iiq.plugins.queryplugin.reporting.vo;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonProperty;
import sailpoint.api.SailPointContext;
import sailpoint.object.ReportColumnConfig;
import sailpoint.object.Rule;
import sailpoint.object.Script;
import sailpoint.tools.GeneralException;
import sailpoint.tools.Util;

@JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY)
public class ColumnSpec {
    private String displayName;

    @JsonProperty(required = true)
    private String name;
    private String renderRule;
    private String renderScript;
    private String uniqueName;
    private String valueClass;

    public ReportColumnConfig asColumnConfig(SailPointContext context) throws GeneralException {
        ReportColumnConfig rcc = new ReportColumnConfig();
        rcc.setField(findUniqueName());
        rcc.setProperty(name);
        rcc.setHeader(findDisplayName());

        if (renderRule != null) {
            rcc.setRenderRule(context.getObject(Rule.class, renderRule));
        }

        if (renderScript != null) {
            Script renderScriptObj = new Script();
            renderScriptObj.setSource(renderScript);
            rcc.setRenderScript(renderScriptObj);
        }

        rcc.setValueClass(valueClass);

        return rcc;
    }

    public String findDisplayName() {
        if (Util.isNotNullOrEmpty(displayName)) {
            return displayName;
        } else {
            return name;
        }
    }

    public String findUniqueName() {
        if (Util.isNotNullOrEmpty(uniqueName)) {
            return uniqueName;
        } else {
            return name;
        }
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getName() {
        return name;
    }

    public String getRenderRule() {
        return renderRule;
    }

    public String getRenderScript() {
        return renderScript;
    }

    public String getUniqueName() {
        return uniqueName;
    }

    public String getValueClass() {
        return valueClass;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public void setName(String name) {
        this.name = name;
    }

    public void setRenderRule(String renderRule) {
        this.renderRule = renderRule;
    }

    public void setRenderScript(String renderScript) {
        this.renderScript = renderScript;
    }

    public void setUniqueName(String uniqueName) {
        this.uniqueName = uniqueName;
    }

    public void setValueClass(String valueClass) {
        this.valueClass = valueClass;
    }
}
