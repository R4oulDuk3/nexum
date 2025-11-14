# Nexum Mesh Messaging

Web-based messaging application for BATMAN-adv mesh networks, designed for disaster relief scenarios.

## Features

- Web-based interface (works on any device with a browser)
- SQLite database with migrations
- Tailwind CSS for modern UI
- Designed for offline/mesh network operation

## Setup

### Windows (PowerShell)

```powershell
# Run setup script
.\setup.ps1

# Run the application
.\run.ps1
```

**Note:** If you encounter execution policy errors, run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Linux/macOS (Bash)

```bash
# Run setup script
chmod +x setup.sh
./setup.sh

# Run the application
./run.sh
```

### Manual Setup

#### Install Dependencies

```bash
# Windows
pip install -r requirements.txt

# Linux/macOS
pip3 install -r requirements.txt
```

#### Run Migrations

Migrations are automatically run on first startup. Migration files are in the `migrations/` directory.

#### Run the Application

```bash
# Windows
python app.py

# Linux/macOS
python3 app.py
```

The application will be available at `http://localhost:5000` (or `http://169.254.x.x:5000` on your mesh network).

## Project Structure

```
app/
├── app.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── setup.sh              # Setup script (Linux/macOS)
├── setup.ps1             # Setup script (Windows PowerShell)
├── run.sh                # Run script (Linux/macOS)
├── run.ps1               # Run script (Windows PowerShell)
├── migrations/           # SQL migration files
│   └── 001_initial_schema.sql
├── templates/            # HTML templates
│   ├── base.html
│   └── dashboard.html
└── data/                 # Database files (created automatically)
    └── messaging.db
```

## Environment Variables

- `HOST`: Host to bind to (default: 0.0.0.0)
- `PORT`: Port to bind to (default: 5000)
- `SECRET_KEY`: Flask secret key (default: dev key)

## Development

To run in development mode:

**Windows (PowerShell):**
```powershell
$env:FLASK_ENV="development"
python app.py
```

**Linux/macOS (Bash):**
```bash
export FLASK_ENV=development
python3 app.py
```

## License

Open source - MIT License

