# aux4/template

Render [Handlebars](https://handlebarsjs.com/) templates from the command line. Pass any parameters as flags and they become the template context, then the rendered result is written to standard output.

aux4/template is handy for generating configuration files, scaffolding boilerplate, producing reports, or building any text output from a reusable template plus a set of values.

## Installation

```bash
aux4 aux4 pkger install aux4/template
```

## System Dependencies

This package runs on Node.js. If it is not already available, the installer can provision it:

- [brew](/r/public/packages/aux4/system-installer-brew)
- [linux](/r/public/packages/aux4/system-installer-linux)

## Usage

Given a template file `template.hbs`:

```handlebars
Hello {{name}}
```

Render it by passing the value as a flag:

```bash
aux4 template --file template.hbs --name David
```

```text
Hello David
```

Every `--key value` flag you pass becomes a variable available in the template. Output is plain text (no HTML escaping), so characters like `&`, `<`, and `>` pass through verbatim.

### Options

- `--file` — Path to the Handlebars template file to render (required).
- `--data <file>` — A JSON file (a single object) used as the base template context.
- `--output <file>` — Write the rendered result to this file instead of standard output.
- `--inputStream true` — Read JSON records from standard input and render the template once per record (see streaming below).
- Any other `--key value` flag becomes a template variable.

### Context sources and precedence

The template context can come from three places, applied lowest to highest precedence:

1. `--data <file>` — base/default fields from a JSON object.
2. A JSON record read from standard input (with `--inputStream true`; see streaming below).
3. `--key value` flags — explicit overrides applied to every render.

So a flag always wins over a value from `--data` or a stream record. For example, with `person.json` containing `{"name":"David","age":30}`:

```bash
aux4 template --file person.hbs --data person.json --age 40
```

```text
David 40
```

The `age` flag overrides the `age` from the data file, while `name` comes from the file.

### Streaming JSON records on standard input

Standard input is only read when you pass `--inputStream true`. With it, the template is rendered once per JSON record read from stdin, and each result is written in order. Both newline-delimited JSON (one object per line) and a single top-level JSON array are accepted:

Template `row.hbs`:

```handlebars
{{name}} is {{age}}
```

```bash
printf '{"name":"Ada","age":36}\n{"name":"Linus","age":54}\n' | aux4 template --file row.hbs --inputStream true
```

```text
Ada is 36
Linus is 54
```

Flags still apply to every record, so `--age 99` would force that value across the whole stream, and `--data` supplies shared defaults. An invalid record stops processing with a non-zero exit code.

Because stdin is read only with `--inputStream true`, plain `--key value` rendering never touches standard input — so it is safe to use inside a pipeline (for example a `... | while read` loop) without redirecting `< /dev/null`.

### Writing to a file

With `--output <file>`, nothing is written to standard output; the rendered result (including every record of a stream, in order) goes to the file. The file is overwritten each run, mirroring a `> file` redirect — to accumulate across runs, omit `--output` and use the shell:

```bash
cat records.ndjson | aux4 template --file row.hbs --inputStream true >> all.txt
```

### Arrays and objects

List and object values are passed as JSON and are parsed automatically, so you can use Handlebars block helpers such as `{{#each}}`.

Template `list.hbs`:

```handlebars
Shopping list:
{{#each items}}
- {{this}}
{{/each}}
```

Command:

```bash
aux4 template --file list.hbs --items '["apples","bananas","cherries"]'
```

```text
Shopping list:
- apples
- bananas
- cherries
```

Objects work the same way and can be accessed with dot notation:

```bash
aux4 template --file card.hbs --user '{"name":"Ada","role":"admin"}'
```

```handlebars
{{user.name}} ({{user.role}})
```

```text
Ada (admin)
```

Because templates use standard Handlebars, the built-in helpers `{{#if}}`, `{{#unless}}`, `{{#each}}`, and `{{#with}}` are all available.

### Type helpers

Flag values arrive as strings, so a few helpers are provided to interpret them. They can be used inline or as subexpressions:

- `bool` — interpret a value as a boolean. Only explicit false-ish values (`false`, `0`, `no`, `off`, or empty) are false; everything else is true.
- `int` — parse an integer.
- `number` — parse a floating-point number.
- `json` — JSON-stringify a value (`{{json value}}`, or `{{json value indent=2}}` to pretty-print).
- `date` — format a date value; `{{date value}}` returns an ISO string, `{{date value "YYYY-MM-DD HH:mm:ss"}}` formats it (UTC). Numeric input is treated as epoch milliseconds.
- `timestamp` — convert a date value to a Unix epoch in seconds.

Because a flag is a string, `{{#if flag}}` is always true for a non-empty value (even `--flag false`). Use the `bool` helper for boolean flags:

```bash
aux4 template --file feature.hbs --enabled false
```

```handlebars
{{#if (bool enabled)}}Feature is on{{else}}Feature is off{{/if}}
```

```text
Feature is off
```

The `date` and `timestamp` helpers convert a value you supply rather than reading the current time, which keeps renders reproducible. To stamp the current time, pass it in (for example `--now "$(date -u +%FT%TZ)"`).

### The `aux4` helper

A built-in `aux4` helper lets a template call another aux4 command and inline its output. The first argument is the command and the rest are its arguments:

```handlebars
Installed version: {{aux4 "version"}}
```

```handlebars
Greeting: {{aux4 "template" "--file" "greeting.hbs" "--name" "World"}}
```

The command runs as `aux4 <args...>` and its standard output (with trailing newlines trimmed) is inserted into the rendered result. Templates are executed as written, so only render templates you trust.

## License

This package is licensed under the [Apache License 2.0](./LICENSE).
