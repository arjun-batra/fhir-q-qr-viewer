import { useState, useCallback, useRef } from "react";

// ─── FHIR UTILS ─────────────────────────────────────────────────────────────

function detectFhirVersion(resource) {
  if (!resource) return "unknown";
  if (resource.meta?.profile) {
    const p = JSON.stringify(resource.meta.profile);
    if (p.includes("hl7.org/fhir/R5") || p.includes("5.0")) return "R5";
    if (p.includes("hl7.org/fhir/R4") || p.includes("4.0")) return "R4";
  }
  if (resource.resourceType === "Questionnaire") {
    const raw = JSON.stringify(resource);
    if (raw.includes("answerConstraint") || raw.includes("disabledDisplay")) return "R5";
  }
  return "R4";
}

function normalizeAnswerValue(answer) {
  if (!answer) return null;
  const keys = [
    "valueBoolean","valueDecimal","valueInteger","valueDate","valueDateTime",
    "valueTime","valueString","valueUri","valueCoding","valueQuantity",
    "valueAttachment","valueReference"
  ];
  for (const k of keys) {
    if (answer[k] !== undefined) {
      return { type: k.replace("value","").toLowerCase(), value: answer[k] };
    }
  }
  if (answer.value !== undefined) {
    return { type: typeof answer.value, value: answer.value };
  }
  return null;
}

function formatAnswerValue(av) {
  if (!av) return "—";
  const { type, value } = av;
  if (type === "boolean") return value ? "Yes" : "No";
  if (type === "coding") return value.display || value.code || JSON.stringify(value);
  if (type === "quantity") return `${value.value ?? ""}${value.unit ? ` ${value.unit}` : ""}`;
  if (type === "date" || type === "datetime") {
    try {
      const d = new Date(value);
      if (type === "date") return d.toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" });
      return d.toLocaleString("en-US", { year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit" });
    } catch { return String(value); }
  }
  if (type === "attachment") return value.title || value.url || "(attachment)";
  if (type === "reference") return value.display || value.reference || "(reference)";
  return String(value);
}

function buildAnswerMap(qrItems, map = {}) {
  if (!qrItems) return map;
  for (const item of qrItems) {
    if (item.linkId) {
      if (item.answer && item.answer.length > 0) {
        if (!map[item.linkId]) map[item.linkId] = [];
        map[item.linkId].push(...item.answer);
      }
    }
    if (item.item) buildAnswerMap(item.item, map);
    if (item.answer) {
      for (const ans of item.answer) {
        if (ans.item) buildAnswerMap(ans.item, map);
      }
    }
  }
  return map;
}

function collectLinkIds(items, set = new Set()) {
  if (!items) return set;
  for (const item of items) {
    if (item.linkId) set.add(item.linkId);
    if (item.item) collectLinkIds(item.item, set);
    if (item.answer) {
      for (const ans of item.answer) {
        if (ans.item) collectLinkIds(ans.item, set);
      }
    }
  }
  return set;
}

function checkAssociation(q, qr) {
  if (qr.questionnaire) {
    const ref = qr.questionnaire;
    if (q.id && (ref === q.id || ref.endsWith("/" + q.id) || ref.includes("Questionnaire/" + q.id))) return true;
    if (q.url && (ref === q.url || ref.startsWith(q.url))) return true;
  }
  const qIds = collectLinkIds(q.item);
  const qrIds = collectLinkIds(qr.item);
  if (qIds.size === 0 || qrIds.size === 0) return false;
  let overlap = 0;
  for (const id of qrIds) { if (qIds.has(id)) overlap++; }
  return overlap / qrIds.size > 0.5;
}

const TYPE_LABELS = {
  string: "Text", text: "Long Text", integer: "Integer", decimal: "Decimal",
  boolean: "Yes / No", date: "Date", dateTime: "Date & Time", time: "Time",
  choice: "Choice", "open-choice": "Open Choice", quantity: "Quantity",
  url: "URL", uri: "URI", attachment: "Attachment", reference: "Reference",
  display: "Display", group: "Group",
};

// ─── STYLES ─────────────────────────────────────────────────────────────────

const S = {
  section: (depth) => ({
    marginTop: depth === 0 ? 28 : 16, marginBottom: 8,
    paddingLeft: depth > 0 ? 20 : 0,
    borderLeft: depth > 0 ? "2px solid var(--border)" : "none",
  }),
  sectionTitle: (depth) => ({
    fontFamily: "var(--font-display)", fontSize: depth === 0 ? 17 : 14,
    fontWeight: 700, color: "var(--heading)", letterSpacing: "-0.01em",
    marginBottom: 10, paddingBottom: 5,
    borderBottom: depth === 0 ? "2px solid var(--accent)" : "1px solid var(--border)",
    textTransform: depth === 0 ? "uppercase" : "none",
  }),
  row: (depth) => ({
    padding: "10px 0", borderBottom: "1px solid var(--row-border)",
    marginLeft: depth > 0 ? 20 : 0,
  }),
  label: {
    fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--label)",
    fontWeight: 500, lineHeight: 1.4,
  },
  value: (has) => ({
    fontFamily: "var(--font-body)", fontSize: 13.5,
    color: has ? "var(--value)" : "var(--empty)",
    fontWeight: has ? 600 : 400, lineHeight: 1.4,
    fontStyle: has ? "normal" : "italic",
  }),
  typeBadge: {
    fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 600,
    background: "var(--tag-bg)", color: "var(--tag-text)",
    padding: "1px 7px", borderRadius: 3, letterSpacing: "0.04em",
    textTransform: "uppercase", marginLeft: 6, verticalAlign: "middle",
  },
};

// ─── CHOICE RENDERING ──────────────────────────────────────────────────────

function ChoiceOptions({ options, selectedCodes, multi }) {
  if (!options || options.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
      {options.map((opt, i) => {
        const vc = opt.valueCoding || opt.valueString;
        const code = typeof vc === "string" ? vc : vc?.code;
        const display = typeof vc === "string" ? vc : (vc?.display || vc?.code || "?");
        const selected = selectedCodes.has(code);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 14, height: 14, borderRadius: multi ? 3 : 7,
              border: selected ? "2px solid var(--accent)" : "2px solid var(--border)",
              background: selected ? "var(--accent)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "all 0.15s",
            }}>
              {selected && (
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5.5L4 7.5L8 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span style={{
              fontFamily: "var(--font-body)", fontSize: 13,
              color: selected ? "var(--value)" : "var(--label)",
              fontWeight: selected ? 600 : 400,
            }}>{display}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── QUESTIONNAIRE-ONLY ITEM ────────────────────────────────────────────────

function QOnlyItem({ qItem, depth = 0 }) {
  if (qItem.type === "group") {
    return (
      <div style={S.section(depth)}>
        <div style={S.sectionTitle(depth)}>{qItem.text || qItem.linkId}</div>
        {qItem.item?.map((child, i) => (
          <QOnlyItem key={child.linkId || i} qItem={child} depth={depth + 1} />
        ))}
      </div>
    );
  }
  if (qItem.type === "display") {
    return (
      <div style={{ ...S.row(depth), color: "var(--label)", fontFamily: "var(--font-body)", fontSize: 13, fontStyle: "italic" }}>
        {qItem.text}
      </div>
    );
  }
  const hasOptions = qItem.answerOption && qItem.answerOption.length > 0;
  const multi = qItem.type === "open-choice" || qItem.repeats;
  return (
    <div style={{ ...S.row(depth), display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        <span style={S.label}>
          {qItem.text || qItem.linkId}
          {qItem.required && <span style={{ color: "var(--required)", marginLeft: 3 }}>*</span>}
        </span>
        <span style={S.typeBadge}>{TYPE_LABELS[qItem.type] || qItem.type}</span>
      </div>
      {hasOptions ? (
        <ChoiceOptions options={qItem.answerOption} selectedCodes={new Set()} multi={multi} />
      ) : (
        <div style={{
          background: "var(--input-bg)", border: "1px solid var(--border)",
          borderRadius: 4, padding: "6px 10px", fontFamily: "var(--font-body)",
          fontSize: 12, color: "var(--empty)", fontStyle: "italic",
          maxWidth: qItem.type === "boolean" ? 80 : qItem.type === "text" ? "100%" : 260,
          minHeight: qItem.type === "text" ? 48 : "auto",
        }}>
          {qItem.type === "boolean" ? "Yes / No" : `Enter ${TYPE_LABELS[qItem.type] || qItem.type}…`}
        </div>
      )}
    </div>
  );
}

// ─── QR-ONLY ITEM ───────────────────────────────────────────────────────────

function QROnlyItem({ qrItem, depth = 0 }) {
  const hasSubItems = qrItem.item && qrItem.item.length > 0;
  const hasAnswers = qrItem.answer && qrItem.answer.length > 0;
  const hasNestedInAnswers = hasAnswers && qrItem.answer.some(a => a.item && a.item.length > 0);

  if (hasSubItems && !hasAnswers) {
    return (
      <div style={S.section(depth)}>
        <div style={S.sectionTitle(depth)}>{qrItem.text || qrItem.linkId}</div>
        {qrItem.item.map((child, i) => (
          <QROnlyItem key={child.linkId || i} qrItem={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <div style={S.row(depth)}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "baseline" }}>
        <div style={S.label}>{qrItem.text || qrItem.linkId}</div>
        <div style={S.value(hasAnswers)}>
          {hasAnswers ? qrItem.answer.map((ans, i) => {
            const av = normalizeAnswerValue(ans);
            return <div key={i}>{formatAnswerValue(av)}</div>;
          }) : "Not answered"}
        </div>
      </div>
      {hasNestedInAnswers && qrItem.answer.map((ans, ai) =>
        ans.item?.map((child, ci) => (
          <QROnlyItem key={`${ai}-${ci}`} qrItem={child} depth={depth + 1} />
        ))
      )}
      {hasSubItems && hasAnswers && qrItem.item.map((child, i) => (
        <QROnlyItem key={i} qrItem={child} depth={depth + 1} />
      ))}
    </div>
  );
}

// ─── MATCHED PAIR ITEM ──────────────────────────────────────────────────────

function MatchedItem({ qItem, answerMap, depth = 0 }) {
  if (qItem.type === "group") {
    return (
      <div style={S.section(depth)}>
        <div style={S.sectionTitle(depth)}>{qItem.text || qItem.linkId}</div>
        {qItem.item?.map((child, i) => (
          <MatchedItem key={child.linkId || i} qItem={child} answerMap={answerMap} depth={depth + 1} />
        ))}
      </div>
    );
  }
  if (qItem.type === "display") {
    return (
      <div style={{ ...S.row(depth), color: "var(--label)", fontFamily: "var(--font-body)", fontSize: 13, fontStyle: "italic" }}>
        {qItem.text}
      </div>
    );
  }

  const answers = answerMap[qItem.linkId] || [];
  const hasAnswer = answers.length > 0;
  const hasOptions = qItem.answerOption && qItem.answerOption.length > 0;
  const multi = qItem.type === "open-choice" || qItem.repeats;

  const selectedCodes = new Set();
  if (hasOptions && hasAnswer) {
    for (const ans of answers) {
      const av = normalizeAnswerValue(ans);
      if (av?.type === "coding") selectedCodes.add(av.value?.code);
      else if (av?.type === "string") selectedCodes.add(av.value);
    }
  }

  return (
    <div style={S.row(depth)}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
        <span style={S.label}>
          {qItem.text || qItem.linkId}
          {qItem.required && <span style={{ color: "var(--required)", marginLeft: 3 }}>*</span>}
        </span>
      </div>
      {hasOptions ? (
        <ChoiceOptions options={qItem.answerOption} selectedCodes={selectedCodes} multi={multi} />
      ) : (
        <div style={S.value(hasAnswer)}>
          {hasAnswer ? answers.map((ans, i) => {
            const av = normalizeAnswerValue(ans);
            return <div key={i}>{formatAnswerValue(av)}</div>;
          }) : "Not answered"}
        </div>
      )}
    </div>
  );
}

// ─── FORM HEADER & TAG ──────────────────────────────────────────────────────

function FormHeader({ title, description, version, meta }) {
  return (
    <div style={{ marginBottom: 28, paddingBottom: 16, borderBottom: "3px solid var(--accent)" }}>
      <h2 style={{
        fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800,
        color: "var(--heading)", margin: 0, letterSpacing: "-0.02em", lineHeight: 1.2,
      }}>{title}</h2>
      {description && (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--label)", margin: "6px 0 0", lineHeight: 1.5 }}>
          {description}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        {version && <Tag label="FHIR" value={version} />}
        {meta.map((m, i) => <Tag key={i} label={m.label} value={m.value} />)}
      </div>
    </div>
  );
}

function Tag({ label, value }) {
  return (
    <span style={{
      fontFamily: "var(--font-body)", fontSize: 10.5,
      background: "var(--tag-bg)", color: "var(--tag-text)",
      padding: "2px 9px", borderRadius: 3, fontWeight: 600,
      letterSpacing: "0.03em", textTransform: "uppercase",
    }}>{label}: {value}</span>
  );
}

// ─── RENDER OUTPUT ──────────────────────────────────────────────────────────

function RenderOutput({ questionnaire, questionnaireResponse }) {
  const hasQ = !!questionnaire;
  const hasQR = !!questionnaireResponse;
  if (!hasQ && !hasQR) return null;

  // Q only
  if (hasQ && !hasQR) {
    return (
      <div>
        <FormHeader title={questionnaire.title || questionnaire.name || "Questionnaire"}
          description={questionnaire.description} version={detectFhirVersion(questionnaire)}
          meta={[{ label: "Mode", value: "Blank Form" }, ...(questionnaire.status ? [{ label: "Status", value: questionnaire.status }] : [])]} />
        {questionnaire.item?.map((qItem, i) => <QOnlyItem key={qItem.linkId || i} qItem={qItem} depth={0} />)}
        {(!questionnaire.item || questionnaire.item.length === 0) && <EmptyMsg text="No items in Questionnaire." />}
      </div>
    );
  }

  // QR only
  if (!hasQ && hasQR) {
    const authored = questionnaireResponse.authored;
    return (
      <div>
        <FormHeader title="Questionnaire Response" description={null} version={detectFhirVersion(questionnaireResponse)}
          meta={[
            { label: "Mode", value: "Response Only" },
            ...(questionnaireResponse.status ? [{ label: "Status", value: questionnaireResponse.status }] : []),
            ...(authored ? [{ label: "Authored", value: new Date(authored).toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric" }) }] : []),
            ...(questionnaireResponse.subject?.display ? [{ label: "Subject", value: questionnaireResponse.subject.display }] : []),
            ...(questionnaireResponse.author?.display ? [{ label: "Author", value: questionnaireResponse.author.display }] : []),
          ]} />
        {questionnaireResponse.item?.map((qrItem, i) => <QROnlyItem key={qrItem.linkId || i} qrItem={qrItem} depth={0} />)}
        {(!questionnaireResponse.item || questionnaireResponse.item.length === 0) && <EmptyMsg text="No items in QuestionnaireResponse." />}
      </div>
    );
  }

  // Both — check association
  const associated = checkAssociation(questionnaire, questionnaireResponse);

  if (!associated) {
    const authored = questionnaireResponse.authored;
    return (
      <div>
        <div style={{
          fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600,
          color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A",
          borderRadius: 6, padding: "10px 14px", marginBottom: 24, lineHeight: 1.5,
        }}>
          ⚠ These resources don't appear to be associated — the QuestionnaireResponse doesn't reference this Questionnaire and linkIds don't sufficiently overlap. Rendering separately.
        </div>
        <div style={{ marginBottom: 40 }}>
          <FormHeader title={questionnaire.title || questionnaire.name || "Questionnaire"}
            description={questionnaire.description} version={detectFhirVersion(questionnaire)}
            meta={[{ label: "Mode", value: "Blank Form" }, ...(questionnaire.status ? [{ label: "Status", value: questionnaire.status }] : [])]} />
          {questionnaire.item?.map((qItem, i) => <QOnlyItem key={qItem.linkId || i} qItem={qItem} depth={0} />)}
        </div>
        <div style={{ borderTop: "3px dashed var(--border)", paddingTop: 28 }}>
          <FormHeader title="Questionnaire Response" description={null} version={detectFhirVersion(questionnaireResponse)}
            meta={[
              { label: "Mode", value: "Response Only" },
              ...(questionnaireResponse.status ? [{ label: "Status", value: questionnaireResponse.status }] : []),
              ...(authored ? [{ label: "Authored", value: new Date(authored).toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric" }) }] : []),
              ...(questionnaireResponse.subject?.display ? [{ label: "Subject", value: questionnaireResponse.subject.display }] : []),
            ]} />
          {questionnaireResponse.item?.map((qrItem, i) => <QROnlyItem key={qrItem.linkId || i} qrItem={qrItem} depth={0} />)}
        </div>
      </div>
    );
  }

  // Matched
  const answerMap = buildAnswerMap(questionnaireResponse.item);
  const authored = questionnaireResponse.authored;
  return (
    <div>
      <FormHeader title={questionnaire.title || questionnaire.name || "Questionnaire"}
        description={questionnaire.description} version={detectFhirVersion(questionnaire)}
        meta={[
          { label: "Mode", value: "Completed Form" },
          ...(questionnaireResponse.status ? [{ label: "Status", value: questionnaireResponse.status }] : []),
          ...(authored ? [{ label: "Authored", value: new Date(authored).toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric" }) }] : []),
          ...(questionnaireResponse.subject?.display ? [{ label: "Subject", value: questionnaireResponse.subject.display }] : []),
          ...(questionnaireResponse.author?.display ? [{ label: "Author", value: questionnaireResponse.author.display }] : []),
        ]} />
      {questionnaire.item?.map((qItem, i) => <MatchedItem key={qItem.linkId || i} qItem={qItem} answerMap={answerMap} depth={0} />)}
    </div>
  );
}

function EmptyMsg({ text }) {
  return (
    <div style={{ textAlign: "center", padding: 40, color: "var(--empty)", fontFamily: "var(--font-body)", fontSize: 13 }}>
      {text}
    </div>
  );
}

// ─── JSON INPUT ─────────────────────────────────────────────────────────────

function JsonInput({ label, value, onChange, onFileUpload, error }) {
  const fileRef = useRef(null);
  return (
    <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label style={{
          fontFamily: "var(--font-display)", fontSize: 11.5, fontWeight: 700,
          color: "var(--heading)", letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          {label}
          <span style={{ fontWeight: 400, color: "var(--empty)", textTransform: "none", marginLeft: 6, fontSize: 11 }}>(optional)</span>
        </label>
        <button onClick={() => fileRef.current?.click()} style={{
          fontFamily: "var(--font-body)", fontSize: 11.5, background: "var(--tag-bg)",
          color: "var(--tag-text)", border: "1px solid var(--border)", borderRadius: 4,
          padding: "3px 10px", cursor: "pointer", fontWeight: 600,
        }}>Upload .json</button>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0]; if (!f) return;
            const reader = new FileReader();
            reader.onload = (ev) => onFileUpload(ev.target.result);
            reader.readAsText(f);
          }}
        />
      </div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={`Paste ${label} JSON here…`} spellCheck={false}
        style={{
          fontFamily: "'IBM Plex Mono', 'Fira Code', monospace", fontSize: 11.5, lineHeight: 1.5,
          background: "var(--input-bg)", color: "var(--value)",
          border: error ? "2px solid var(--required)" : "1px solid var(--border)",
          borderRadius: 6, padding: 12, minHeight: 160, resize: "vertical",
          outline: "none", width: "100%", boxSizing: "border-box",
        }}
      />
      {error && <div style={{ fontFamily: "var(--font-body)", fontSize: 11.5, color: "var(--required)", fontWeight: 500 }}>{error}</div>}
    </div>
  );
}

// ─── SAMPLE DATA ────────────────────────────────────────────────────────────

const SAMPLE_Q = {
  resourceType: "Questionnaire", id: "sample-intake",
  title: "Patient Intake Form", status: "active", url: "http://example.org/Questionnaire/sample-intake",
  description: "A sample patient intake questionnaire for demonstration.",
  item: [
    { linkId: "1", type: "group", text: "Demographics", item: [
      { linkId: "1.1", type: "string", text: "Full Name", required: true },
      { linkId: "1.2", type: "date", text: "Date of Birth", required: true },
      { linkId: "1.3", type: "choice", text: "Sex", answerOption: [
        { valueCoding: { code: "M", display: "Male" } },
        { valueCoding: { code: "F", display: "Female" } },
        { valueCoding: { code: "O", display: "Other" } },
      ]},
    ]},
    { linkId: "2", type: "group", text: "Medical History", item: [
      { linkId: "2.1", type: "boolean", text: "Do you have any known allergies?" },
      { linkId: "2.2", type: "text", text: "List current medications" },
      { linkId: "2.3", type: "quantity", text: "Current weight" },
      { linkId: "2.4", type: "choice", text: "Blood Type", repeats: true, answerOption: [
        { valueCoding: { code: "A", display: "A" } }, { valueCoding: { code: "B", display: "B" } },
        { valueCoding: { code: "AB", display: "AB" } }, { valueCoding: { code: "O", display: "O" } },
      ]},
    ]},
    { linkId: "3", type: "group", text: "Visit Details", item: [
      { linkId: "3.1", type: "choice", text: "Reason for Visit", answerOption: [
        { valueCoding: { code: "checkup", display: "Annual Checkup" } },
        { valueCoding: { code: "illness", display: "Illness / Symptoms" } },
        { valueCoding: { code: "followup", display: "Follow-up" } },
      ]},
      { linkId: "3.2", type: "dateTime", text: "Preferred appointment time" },
    ]},
  ]
};

const SAMPLE_QR = {
  resourceType: "QuestionnaireResponse", status: "completed",
  questionnaire: "http://example.org/Questionnaire/sample-intake",
  authored: "2025-09-14T10:30:00Z",
  subject: { display: "Jane Doe" }, author: { display: "Dr. Smith" },
  item: [
    { linkId: "1", item: [
      { linkId: "1.1", answer: [{ valueString: "Jane Doe" }] },
      { linkId: "1.2", answer: [{ valueDate: "1988-04-12" }] },
      { linkId: "1.3", answer: [{ valueCoding: { code: "F", display: "Female" } }] },
    ]},
    { linkId: "2", item: [
      { linkId: "2.1", answer: [{ valueBoolean: true }] },
      { linkId: "2.2", answer: [{ valueString: "Lisinopril 10mg, Metformin 500mg" }] },
      { linkId: "2.3", answer: [{ valueQuantity: { value: 68, unit: "kg" } }] },
      { linkId: "2.4", answer: [{ valueCoding: { code: "O", display: "O" } }] },
    ]},
    { linkId: "3", item: [
      { linkId: "3.1", answer: [{ valueCoding: { code: "checkup", display: "Annual Checkup" } }] },
      { linkId: "3.2", answer: [{ valueDateTime: "2025-09-20T14:00:00Z" }] },
    ]},
  ]
};

// ─── MAIN APP ───────────────────────────────────────────────────────────────

const sampleBtnStyle = {
  fontFamily: "var(--font-body)", fontSize: 11.5, fontWeight: 500,
  background: "transparent", color: "var(--label)", border: "1px solid var(--border)",
  borderRadius: 4, padding: "5px 12px", cursor: "pointer",
};

export default function FHIRViewer() {
  const [qText, setQText] = useState("");
  const [qrText, setQRText] = useState("");
  const [qError, setQError] = useState(null);
  const [qrError, setQRError] = useState(null);
  const [result, setResult] = useState(null);
  const [view, setView] = useState("input");

  const handleRender = useCallback(() => {
    let q = null, qr = null;
    setQError(null); setQRError(null);
    const hasQText = qText.trim().length > 0;
    const hasQRText = qrText.trim().length > 0;

    if (!hasQText && !hasQRText) {
      setQError("Provide at least one resource");
      setQRError("Provide at least one resource");
      return;
    }
    if (hasQText) {
      try { q = JSON.parse(qText); } catch { setQError("Invalid JSON"); return; }
      if (q.resourceType !== "Questionnaire") { setQError('resourceType must be "Questionnaire"'); return; }
    }
    if (hasQRText) {
      try { qr = JSON.parse(qrText); } catch { setQRError("Invalid JSON"); return; }
      if (qr.resourceType !== "QuestionnaireResponse") { setQRError('resourceType must be "QuestionnaireResponse"'); return; }
    }
    setResult({ questionnaire: q, questionnaireResponse: qr });
    setView("rendered");
  }, [qText, qrText]);

  const loadSample = (mode) => {
    setQError(null); setQRError(null);
    if (mode === "both") { setQText(JSON.stringify(SAMPLE_Q, null, 2)); setQRText(JSON.stringify(SAMPLE_QR, null, 2)); }
    else if (mode === "q") { setQText(JSON.stringify(SAMPLE_Q, null, 2)); setQRText(""); }
    else if (mode === "qr") { setQText(""); setQRText(JSON.stringify(SAMPLE_QR, null, 2)); }
  };

  return (
    <div style={{
      "--font-display": "'DM Sans', 'Helvetica Neue', sans-serif",
      "--font-body": "'DM Sans', 'Helvetica Neue', sans-serif",
      "--bg": "#FAFAF8", "--surface": "#FFFFFF", "--heading": "#1A1A1A",
      "--label": "#6B6B6B", "--value": "#1A1A1A", "--empty": "#B0ADA8",
      "--accent": "#2563EB", "--accent-hover": "#1D4ED8", "--required": "#DC2626",
      "--border": "#E5E3DF", "--row-border": "#F0EEEA", "--tag-bg": "#F0EEEA",
      "--tag-text": "#4A4A4A", "--input-bg": "#F5F4F1", "--btn-text": "#FFFFFF",
      minHeight: "100vh", background: "var(--bg)", padding: "28px 16px", boxSizing: "border-box",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 860, margin: "0 auto 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 800, color: "var(--heading)", letterSpacing: "-0.03em" }}>
          <span style={{ color: "var(--accent)" }}>FHIR</span> Form Viewer
        </div>
        {view === "rendered" && (
          <button onClick={() => setView("input")} style={{
            fontFamily: "var(--font-body)", fontSize: 12.5, fontWeight: 600,
            background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)",
            borderRadius: 6, padding: "5px 16px", cursor: "pointer",
          }}>← Back to Input</button>
        )}
      </div>

      <div style={{
        maxWidth: 860, margin: "0 auto", background: "var(--surface)", borderRadius: 10,
        border: "1px solid var(--border)", padding: "24px 28px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        {view === "input" ? (
          <>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
              <JsonInput label="Questionnaire" value={qText} onChange={(v) => { setQText(v); setQError(null); }}
                onFileUpload={(v) => { setQText(v); setQError(null); }} error={qError} />
              <JsonInput label="QuestionnaireResponse" value={qrText} onChange={(v) => { setQRText(v); setQRError(null); }}
                onFileUpload={(v) => { setQRText(v); setQRError(null); }} error={qrError} />
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={handleRender}
                onMouseOver={(e) => e.currentTarget.style.background = "var(--accent-hover)"}
                onMouseOut={(e) => e.currentTarget.style.background = "var(--accent)"}
                style={{
                  fontFamily: "var(--font-display)", fontSize: 13.5, fontWeight: 700,
                  background: "var(--accent)", color: "var(--btn-text)", border: "none",
                  borderRadius: 6, padding: "9px 24px", cursor: "pointer", letterSpacing: "0.02em",
                }}>Render</button>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--empty)" }}>Load sample:</span>
              <button onClick={() => loadSample("both")} style={sampleBtnStyle}>Both</button>
              <button onClick={() => loadSample("q")} style={sampleBtnStyle}>Q only</button>
              <button onClick={() => loadSample("qr")} style={sampleBtnStyle}>QR only</button>
            </div>
          </>
        ) : (
          result && <RenderOutput questionnaire={result.questionnaire} questionnaireResponse={result.questionnaireResponse} />
        )}
      </div>

      <div style={{
        maxWidth: 860, margin: "14px auto 0", textAlign: "center",
        fontFamily: "var(--font-body)", fontSize: 10.5, color: "var(--empty)", letterSpacing: "0.02em",
      }}>
        FHIR R4 &amp; R5 • Read-only • Questionnaire · QuestionnaireResponse · or both
      </div>
    </div>
  );
}
