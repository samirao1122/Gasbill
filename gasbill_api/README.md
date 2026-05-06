# ⛽ Gas Bill Management — Django REST API

## 📁 Project Structure
```
gasbill_api/
├── manage.py
├── requirements.txt
├── gasbill_api/
│   ├── __init__.py
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
└── bills/
    ├── __init__.py
    ├── apps.py
    ├── models.py
    ├── serializers.py
    ├── views.py
    ├── urls.py
    └── admin.py
```

---

## 🚀 HOW TO RUN (Step by Step)

### Step 1 — Create virtual environment
```bash
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate
```

### Step 2 — Install packages
```bash
pip install -r requirements.txt
```

### Step 3 — Run migrations
```bash
python manage.py makemigrations
python manage.py migrate
```

### Step 4 — Create admin superuser
```bash
python manage.py createsuperuser
# Enter username, email, password
```

### Step 5 — Start server
```bash
python manage.py runserver
```

Server runs at: **http://127.0.0.1:8000/**

Django Admin Panel: **http://127.0.0.1:8000/admin/**

### Deploy on PythonAnywhere
1. Upload the project to PythonAnywhere and set the working directory to the `gasbill_api/` folder.
2. In the Web tab, set the WSGI configuration file to use `gasbill_api.wsgi`.
3. Install dependencies with:
```bash
pip install -r requirements.txt
```
4. Run migrations:
```bash
python manage.py makemigrations
python manage.py migrate
```
5. Collect static files:
```bash
python manage.py collectstatic --noinput
```
6. In the PythonAnywhere Web tab, map `/static/` to the `staticfiles/` directory.
7. Optionally set environment variables in the Web tab:
   - `SECRET_KEY`
   - `DEBUG=False`
   - `ALLOWED_HOSTS=yourusername.pythonanywhere.com`
   - `CSRF_TRUSTED_ORIGINS=https://yourusername.pythonanywhere.com`

---

## 🔐 AUTHENTICATION

All endpoints require JWT token (except register & login).

### Register
```
POST /api/auth/register/
{
  "username": "ali",
  "email": "ali@gmail.com",
  "password": "ali12345",
  "first_name": "Ali",
  "last_name": "Ahmed"
}
```

### Login (get token)
```
POST /api/auth/login/
{
  "username": "ali",
  "password": "ali12345"
}
→ Returns: { "access": "...", "refresh": "..." }
```

### Use Token in all requests:
```
Header: Authorization: Bearer <access_token>
```

### Refresh Token
```
POST /api/auth/refresh/
{ "refresh": "<refresh_token>" }
```

### My Profile
```
GET  /api/auth/profile/      → view profile
PUT  /api/auth/profile/      → update profile
PATCH /api/auth/profile/     → partial update
```

---

## 📊 DASHBOARD
```
GET /api/dashboard/
→ Returns: total customers, bills, revenue, complaints, etc.
```

---

## 👥 CUSTOMERS — Full CRUD

| Method | URL | Action |
|--------|-----|--------|
| GET    | /api/customers/           | List all customers |
| POST   | /api/customers/           | Create customer |
| GET    | /api/customers/{id}/      | Get single customer |
| PUT    | /api/customers/{id}/      | Full update |
| PATCH  | /api/customers/{id}/      | Partial update |
| DELETE | /api/customers/{id}/      | Delete customer |
| GET    | /api/customers/{id}/bills/      | Customer's bills |
| GET    | /api/customers/{id}/readings/   | Customer's readings |
| GET    | /api/customers/{id}/complaints/ | Customer's complaints |
| PATCH  | /api/customers/{id}/change-status/ | Change status |

### Create Customer Example:
```json
POST /api/customers/
{
  "name": "Muhammad Usman",
  "father_name": "Muhammad Akbar",
  "cnic": "34101-1234567-1",
  "phone": "0300-1234567",
  "email": "usman@gmail.com",
  "address": "Street 5, Model Town, Gujranwala",
  "city": "Gujranwala",
  "meter_number": "GW-00123",
  "meter_type": "residential",
  "connection_date": "2023-01-15",
  "status": "active"
}
```

### Search & Filter:
```
GET /api/customers/?search=usman
GET /api/customers/?search=GW-00123
GET /api/customers/?ordering=-created_at
```

---

## 💰 GAS TARIFFS — Full CRUD

| Method | URL | Action |
|--------|-----|--------|
| GET    | /api/tariffs/         | List all tariffs |
| POST   | /api/tariffs/         | Create tariff |
| GET    | /api/tariffs/{id}/    | Get tariff |
| PUT    | /api/tariffs/{id}/    | Update tariff |
| PATCH  | /api/tariffs/{id}/    | Partial update |
| DELETE | /api/tariffs/{id}/    | Delete tariff |
| GET    | /api/tariffs/active/  | Active tariffs only |

### Create Tariff Example:
```json
POST /api/tariffs/
{
  "slab": "slab1",
  "min_units": 0,
  "max_units": 100,
  "rate_per_unit": "50.00",
  "fixed_charges": "150.00",
  "effective_from": "2024-01-01",
  "is_active": true
}
```

---

## 📏 METER READINGS — Full CRUD

| Method | URL | Action |
|--------|-----|--------|
| GET    | /api/readings/          | List all readings |
| POST   | /api/readings/          | Add new reading |
| GET    | /api/readings/{id}/     | Get reading |
| PUT    | /api/readings/{id}/     | Update reading |
| PATCH  | /api/readings/{id}/     | Partial update |
| DELETE | /api/readings/{id}/     | Delete reading |
| POST   | /api/readings/{id}/confirm/ | Confirm reading |

### Create Reading Example:
```json
POST /api/readings/
{
  "customer": 1,
  "reading_date": "2024-12-01",
  "previous_reading": "1200.00",
  "current_reading": "1350.00",
  "status": "confirmed",
  "reader_name": "Bilal Ahmed"
}
```

### Filter by customer or month:
```
GET /api/readings/?customer=1
GET /api/readings/?month=2024-12
```

---

## 🧾 GAS BILLS — Full CRUD

| Method | URL | Action |
|--------|-----|--------|
| GET    | /api/bills/               | List all bills |
| POST   | /api/bills/               | Generate bill |
| GET    | /api/bills/{id}/          | Get bill detail |
| PUT    | /api/bills/{id}/          | Update bill |
| PATCH  | /api/bills/{id}/          | Partial update |
| DELETE | /api/bills/{id}/          | Delete bill |
| PATCH  | /api/bills/{id}/mark-paid/    | Mark as paid |
| PATCH  | /api/bills/{id}/mark-overdue/ | Mark as overdue |
| GET    | /api/bills/{id}/payments/     | Bill payments |
| GET    | /api/bills/overdue/           | All overdue bills |

### Generate Bill Example:
```json
POST /api/bills/
{
  "customer": 1,
  "meter_reading": 1,
  "tariff": 1,
  "billing_month": "2024-12-01",
  "due_date": "2025-01-10",
  "units_consumed": "150.00",
  "gas_charges": "8500.00",
  "fixed_charges": "150.00",
  "meter_rent": "50.00",
  "gst_percent": "17.00",
  "gst_amount": "1462.50",
  "previous_arrears": "0.00",
  "total_amount": "10162.50",
  "status": "unpaid"
}
```

### Filter bills:
```
GET /api/bills/?status=unpaid
GET /api/bills/?status=paid
GET /api/bills/?customer=1
GET /api/bills/?month=2024-12
```

---

## 💳 PAYMENTS — Full CRUD

| Method | URL | Action |
|--------|-----|--------|
| GET    | /api/payments/        | List all payments |
| POST   | /api/payments/        | Record payment |
| GET    | /api/payments/{id}/   | Get payment |
| PUT    | /api/payments/{id}/   | Update payment |
| PATCH  | /api/payments/{id}/   | Partial update |
| DELETE | /api/payments/{id}/   | Delete payment |

### Record Payment Example:
```json
POST /api/payments/
{
  "bill": 1,
  "payment_date": "2024-12-20",
  "amount": "10162.50",
  "payment_method": "easypaisa",
  "transaction_id": "TXN-20241220-001",
  "status": "completed",
  "remarks": "Full payment received"
}
```

### Filter payments:
```
GET /api/payments/?bill=1
GET /api/payments/?method=cash
```

---

## 📢 COMPLAINTS — Full CRUD

| Method | URL | Action |
|--------|-----|--------|
| GET    | /api/complaints/              | List all |
| POST   | /api/complaints/              | Submit complaint |
| GET    | /api/complaints/{id}/         | Get detail |
| PUT    | /api/complaints/{id}/         | Update |
| PATCH  | /api/complaints/{id}/         | Partial update |
| DELETE | /api/complaints/{id}/         | Delete |
| PATCH  | /api/complaints/{id}/resolve/ | Resolve complaint |
| PATCH  | /api/complaints/{id}/assign/  | Assign to user |

### Submit Complaint Example:
```json
POST /api/complaints/
{
  "customer": 1,
  "category": "billing",
  "priority": "high",
  "subject": "Wrong bill amount",
  "description": "My bill shows 500 units but meter shows 150 units only."
}
```

### Resolve Complaint:
```json
PATCH /api/complaints/1/resolve/
{ "resolution": "Bill recalculated and corrected." }
```

### Filter:
```
GET /api/complaints/?status=open
GET /api/complaints/?priority=critical
```

---

## 🧪 TESTING WITH POSTMAN

1. Import requests to Postman
2. Login → copy `access` token
3. Set Authorization header: `Bearer <token>`
4. Test any endpoint above

---

## 📦 MODELS SUMMARY

- **Customer** — meter holder with CNIC, address, meter number
- **GasTariff** — pricing slabs (slab1–slab4)
- **MeterReading** — monthly unit readings (auto-calculates units)
- **GasBill** — generated bill with GST, charges, status
- **Payment** — payments against bills (auto-updates bill status)
- **Complaint** — customer issues with assignment & resolution
