function renderInline(text) 
{
    return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    {
        const m = part.match(/^\*\*([^*]+)\*\*$/);
        return m ? <strong key={i}>{m[1]}</strong> : part || null;
    });
}

function renderBody(body) 
{
    if(!body) return null;

    const result = [];
    let list = [];

    const flush = () => 
    {
        if(list.length) 
        {
            result.push(<ul key={`ul-${result.length}`} className="eval-card__list">{list}</ul>);
            list = [];
        }
    };

    body.split('\n').forEach((line, i) => 
    {
        const trimmed = line.trim();

        if(trimmed.startsWith('- ')) 
        {
            list.push(<li key={i}>{renderInline(trimmed.slice(2))}</li>);
        } 
        else if(trimmed === '') 
        {
            flush();
        } 
        else 
        {
            flush();
            result.push(<p key={i} className="eval-card__note">{renderInline(trimmed)}</p>);
        }
    });

    flush();
    return result;
}

function parseEvaluationSections(text) 
{
    if (!text) return null;

    // Strip enclosing quotation marks added by some AI providers (e.g. OpenRouter)
    let normalized = text.trim();
    if (normalized.startsWith('"') && normalized.endsWith('"')) 
    {
        normalized = normalized.slice(1, -1).trim();
    }

    // Split at any known section heading in all supported formats:
    // **Heading**[optional inline body], **Heading**  \n, Heading:, plain Heading
    const blocks = normalized.split(
        /\n(?=\*\*(?:Summary|Strengths|Weaknesses|Conclusion)\*\*|(?:Summary|Strengths|Weaknesses|Conclusion):?\s*(?:\n|$))/
    );

    const sections = blocks.map((block) => 
    {
        const nl = block.indexOf('\n');
        const firstLine = nl === -1 ? block : block.slice(0, nl);
        const rest = nl === -1 ? '' : block.slice(nl + 1);

        // Bold heading, possibly with inline body: **Heading** or **Heading**body text
        let m = firstLine.match(/^\*\*(Summary|Strengths|Weaknesses|Conclusion)\*\*\s*(.*)/);
        if (m) 
        {
            const inlineBody = m[2].trim();
            const fullBody = [inlineBody, rest.trim()].filter(Boolean).join('\n');
            return { heading: m[1].trim(), body: fullBody };
        }

        // Plain or colon heading: Heading or Heading:
        m = firstLine.match(/^(Summary|Strengths|Weaknesses|Conclusion):?\s*$/);
        if (m) 
        {
            return { heading: m[1].trim(), body: rest.trim() };
        }

        return null;
    }).filter(Boolean);

    return sections.length > 0 ? sections : null;
}

const SECTION_MOD = { Summary: 'summary', Strengths: 'strengths', Weaknesses: 'weaknesses', Conclusion: 'conclusion' };

function EvaluationReport({ text }) 
{
    const sections = parseEvaluationSections(text);

    if(!sections) return <div className="report-content">{text}</div>;

    return (
        <div className="eval-report">
        {sections.map((section, i) => 
        (
            <div key={i} className={`eval-card eval-card--${SECTION_MOD[section.heading] || 'default'}`}>
            <div className="eval-card__header">
                <span className="eval-card__heading">{section.heading}</span>
            </div>
            <div className="eval-card__body">{renderBody(section.body)}</div>
            </div>
        ))}
        </div>
    );
}

export default EvaluationReport;