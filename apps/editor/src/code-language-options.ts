// lowlight 3 common grammar names plus the existing html/powershell choices (#645).
// Keep this metadata independent of code-languages.ts so the menu never imports grammars.
// Plaintext is represented by the empty fence; other distinct fence names stay literal.
export const codeLanguageOptions = [
  "", "javascript", "typescript", "python", "bash", "powershell", "json", "yaml",
  "html", "css", "sql", "c", "cpp", "csharp", "java", "go", "rust",
  "arduino", "diff", "graphql", "ini", "kotlin", "less", "lua", "makefile", "markdown",
  "objectivec", "perl", "php", "php-template", "python-repl", "r", "ruby", "scss", "shell",
  "swift", "vbnet", "wasm", "xml",
];
