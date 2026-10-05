"""Batch whole lyric lines with the installed Argos model, preserving line order."""
import ctranslate2
from argostranslate.package import get_installed_packages

_package = None
_model = None


def translate_lines(lines):
    global _package, _model
    if _model is None:
        _package = next(p for p in get_installed_packages() if p.from_code == 'it' and p.to_code == 'en')
        _model = ctranslate2.Translator(str(_package.package_path / 'model'), device='cpu', inter_threads=1, intra_threads=2)
    tokens = [_package.tokenizer.encode(line) for line in lines]
    results = _model.translate_batch(
        tokens,
        target_prefix=[[_package.target_prefix]] * len(tokens) if _package.target_prefix else None,
        replace_unknowns=True, max_batch_size=256, batch_type='tokens',
        beam_size=4, num_hypotheses=1, length_penalty=0.2,
    )
    output = [_package.tokenizer.decode(r.hypotheses[0]).removeprefix(_package.target_prefix).strip() for r in results]
    # The model occasionally emits EOS immediately for an all-caps heading.
    # Retry only those inputs with ordinary casing; keep their original cache keys.
    empty = [i for i, value in enumerate(output) if not value]
    if empty:
        retry = _model.translate_batch(
            [_package.tokenizer.encode(lines[i].lower()) for i in empty],
            target_prefix=[[_package.target_prefix]] * len(empty) if _package.target_prefix else None,
            replace_unknowns=True, beam_size=4, num_hypotheses=1, length_penalty=0.2,
        )
        for i, result in zip(empty, retry):
            output[i] = _package.tokenizer.decode(result.hypotheses[0]).removeprefix(_package.target_prefix).strip()
    if len(output) != len(lines) or not all(output):
        raise ValueError('Incomplete lyric translation batch')
    return output
