"""Production logs must never contain local variable values from tracebacks."""

from types import SimpleNamespace

import pytest

import logger as logger_module

SECRET = "synthetic-secret-value-9f3a"


def _log_exception_with_secret():
    try:
        payload = {"api_key": SECRET}
        raise ValueError(f"boom {len(payload)}")
    except ValueError:
        logger_module.logger.exception("Synthetic failure")


@pytest.mark.parametrize("log_format", ["json", "text"])
def test_production_logs_omit_local_variables(tmp_path, monkeypatch, capsys, log_format):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(
        logger_module,
        "settings",
        # File logging on, so both kinds of sink are checked
        SimpleNamespace(environment="production", log_format=log_format, log_level="INFO", log_to_file=True),
    )
    try:
        logger_module.setup_logging()
        _log_exception_with_secret()
        logger_module.logger.complete()
        stdout = capsys.readouterr().out
        files = list((tmp_path / "logs").glob("*.log"))
        assert files, "file sink was not created"
        file_text = "".join(f.read_text() for f in files)
    finally:
        monkeypatch.undo()
        logger_module.setup_logging()

    assert "Synthetic failure" in stdout and "Synthetic failure" in file_text
    assert SECRET not in stdout
    assert SECRET not in file_text


def test_no_log_files_unless_asked(tmp_path, monkeypatch):
    """Cloud Run's filesystem is in memory: by default production logs go to stdout only."""
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(
        logger_module,
        "settings",
        SimpleNamespace(environment="production", log_format="json", log_level="INFO", log_to_file=False),
    )
    try:
        logger_module.setup_logging()
        logger_module.logger.info("hello")
        logger_module.logger.complete()
    finally:
        monkeypatch.undo()
        logger_module.setup_logging()
    assert not (tmp_path / "logs").exists()
