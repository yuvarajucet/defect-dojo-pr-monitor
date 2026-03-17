# Setting Up DefectDojo Locally

This guide provides step-by-step instructions to set up and run the [DefectDojo](https://github.com/DefectDojo/django-DefectDojo) project on your local machine.

## Prerequisites

Ensure you have the following installed:
- **Python** (version 3.9 or later): Download and install from [python.org](https://www.python.org/downloads/).
- **PostgreSQL** (version 13 or later): Download and install from [postgresql.org](https://www.postgresql.org/download/).
- **Node.js and npm**: Download and install from [nodejs.org](https://nodejs.org/en/download/).
- **Git**: Required to clone the repository. Download from [git-scm.com](https://git-scm.com/downloads).
- **Visual Studio Code (VS Code)**: Recommended IDE. Download from [code.visualstudio.com](https://code.visualstudio.com/download).

## Setup Instructions

Follow these steps to set up and run DefectDojo locally:

### 1. Clone the Repository
Clone the DefectDojo project to your local machine:
```bash
git clone https://gitea.syncfusion.com/appsec/Sync-Defectdojo.git
```

### 2. Open the Project in VS Code
1. Open Visual Studio Code.
2. Select **File > Open Folder** and navigate to the cloned `Sync-Defectdojo` directory.

### 3. Configure `launch.json` for Debugging
1. Open the **Run and Debug** panel in VS Code (`Ctrl+Shift+D` or `Cmd+Shift+D` on macOS).
2. Click **create a launch.json file**.
3. Select **Python** as the environment.
4. Choose **Django** as the project type.
5. Select `manage.py` as the entry point.
   - This creates a `launch.json` file in the `.vscode` folder, configured for Django debugging.

### 4. Create and Activate a Virtual Environment
1. From the project’s root directory (`Sync-Defectdojo`), create a virtual environment:
   ```bash
   python -m venv venv
   ```
2. Activate the virtual environment:
   - **On Windows**:
     ```bash
     venv\Scripts\activate
     ```
   - **On macOS/Linux**:
     ```bash
     source venv/bin/activate
     ```
   After activation, your terminal prompt should show `(venv)`.

### 5. Install Python Dependencies
Install the required Python packages listed in `requirements.txt`:
```bash
pip install -r requirements.txt
```
**Note**: If you encounter issues with `psycopg2`, install `psycopg2-binary`:
```bash
pip install psycopg2-binary
```

### 6. Install npm Packages
Navigate to the `components` directory containing `package.json` and install Node.js dependencies:
```bash
cd components
npm install
```
**Note**: The `package.json` file is typically located at `Sync-Defectdojo/components/package.json`.

### 7. Collect Static Files
Run the following command to collect static files for the Django server:
```bash
python manage.py collectstatic
```
This copies static files to the location specified in your Django settings (e.g., `STATIC_ROOT`).

### 8. Configure PostgreSQL Database
1. Open the settings file located at `Sync-Defectdojo/settings/settings.dist.py`.
2. Locate the `DATABASES` configuration (search for `5432`, the default PostgreSQL port).
3. Update the database details with your PostgreSQL credentials:
   ```python
   DATABASES = {
       'default': {
           'ENGINE': 'django.db.backends.postgresql',
           'NAME': 'your_db_name',  # Replace with your database name
           'USER': 'your_db_user',  # Replace with your database user
           'PASSWORD': 'your_db_password',  # Replace with your database password
           'HOST': 'localhost',  # Or your database host
           'PORT': '5432',
       }
   }
   ```
4. Ensure your PostgreSQL server is running and the database exists. Create it if needed:
   ```bash
   createdb -U your_db_user your_db_name
   ```

### 9. Apply Database Migrations
Run migrations to set up the database schema:

```bash
python manage.py makemigrations
```

```bash
python manage.py migrate
```

### 10. Create an Admin User
Create a superuser to access the DefectDojo admin interface:
1. Open the Django shell:
   ```bash
   python manage.py shell
   ```
2. Run the following Python commands to create a superuser:
   ```python
   from django.contrib.auth.models import User
   user = User.objects.create_superuser(
       username='adminusername',  # Replace with desired username
       email='admin@example.com',  # Replace with desired email
       password='securepassword123'  # Replace with a strong password
   )
   exit()
   ```

Alternatively, use the command-line shortcut:
```bash
python manage.py createsuperuser
```
Follow the prompts to set the username, email, and password.

### 11. Run the Development Server
Start the Django development server:
```bash
python manage.py runserver
```
Access the DefectDojo application at [http://127.0.0.1:8000/](http://127.0.0.1:8000/).

### 12. Log In
- Use the admin credentials created in step 10 to log in.
- Access the admin interface at [http://127.0.0.1:8000/admin/](http://127.0.0.1:8000/admin/) for administrative tasks.

## Troubleshooting

- **Database Errors**: If you see `django.core.exceptions.ImproperlyConfigured: Error loading psycopg2 or psycopg module`, ensure `psycopg2-binary` is installed (`pip install psycopg2-binary`) and PostgreSQL is running.
- **npm Install Issues**: Delete `node_modules` and `package-lock.json`, then rerun `npm install`.
- **Permission Issues**: Ensure you have write permissions in the project directory.
- **Port Conflicts**: If port `8000` is in use, specify a different port:
  ```bash
  python manage.py runserver 8080
  ```

## Additional Notes
- **Update `requirements.txt`**: After installing new packages, update `requirements.txt`:
  ```bash
  pip freeze > requirements.txt
  ```
- **Security**: Use strong passwords for admin users and secure your PostgreSQL database.
- **Documentation**: Refer to the [DefectDojo documentation](https://documentation.defectdojo.com/) for advanced configuration.

For further assistance, check the [DefectDojo GitHub repository](https://github.com/DefectDojo/django-DefectDojo) or contact the project maintainers.