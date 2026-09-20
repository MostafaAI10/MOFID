# Run the full Mofid app

The all-in-one launchers start the existing services in order without installing packages or downloading models:

1. Build the React teacher dashboard.
2. Start Chroma.
3. Index the curriculum.
4. Start the local llama.cpp model server when its files are present.
5. Start FastAPI, which serves both frontend surfaces.

When the Karnak model or llama.cpp files are missing, the launcher automatically
uses retrieval-only mode. Student questions still return matching curriculum
passages and citations; generated model prose is unavailable until live mode is
enabled.

## Windows

From the repository root:

```bat
run_all.bat
```

The launcher opens service windows and prints:

- Student app: `http://localhost:8082/`
- Teacher dashboard: `http://localhost:8082/dashboard`

## macOS / Linux

From the repository root:

```sh
chmod +x run_all.sh
./run_all.sh
```

The launcher keeps the services in one terminal. Press `Ctrl+C` to stop them together. Logs are written to `work/logs/`.

## Prerequisites

These launchers do not run setup or install anything. They require the existing project environment, dashboard `node_modules`, Chroma, llama.cpp, and the Karnak model to already be present. Configure alternate ports or paths with the existing `MOFID_*` environment variables.

Set `MOFID_LLM_MODE=live` to require the model, or leave it unset to use
automatic fallback to retrieval-only mode when the model is absent.
