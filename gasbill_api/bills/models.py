from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator


class Customer(models.Model):
    """Gas connection customer"""
    METER_TYPE_CHOICES = [
        ('residential', 'Residential'),
        ('commercial',  'Commercial'),
        ('industrial',  'Industrial'),
    ]
    STATUS_CHOICES = [
        ('active',      'Active'),
        ('inactive',    'Inactive'),
        ('suspended',   'Suspended'),
        ('disconnected','Disconnected'),
    ]

    user             = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='customers')
    name             = models.CharField(max_length=200)
    father_name      = models.CharField(max_length=200, blank=True)
    cnic             = models.CharField(max_length=15, unique=True)
    phone            = models.CharField(max_length=20)
    email            = models.EmailField(blank=True)
    address          = models.TextField()
    city             = models.CharField(max_length=100, default='Gujranwala')
    meter_number     = models.CharField(max_length=50, unique=True)
    meter_type       = models.CharField(max_length=20, choices=METER_TYPE_CHOICES, default='residential')
    connection_date  = models.DateField()
    status           = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} - {self.meter_number}"


class GasTariff(models.Model):
    """Gas pricing slabs"""
    SLAB_CHOICES = [
        ('slab1', 'Slab 1 (0–100 units)'),
        ('slab2', 'Slab 2 (101–300 units)'),
        ('slab3', 'Slab 3 (301–500 units)'),
        ('slab4', 'Slab 4 (500+ units)'),
    ]

    slab           = models.CharField(max_length=10, choices=SLAB_CHOICES, unique=True)
    min_units      = models.PositiveIntegerField(default=0)
    max_units      = models.PositiveIntegerField(null=True, blank=True, help_text='Leave blank for unlimited')
    rate_per_unit  = models.DecimalField(max_digits=8, decimal_places=2, validators=[MinValueValidator(0)])
    fixed_charges  = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    effective_from = models.DateField()
    is_active      = models.BooleanField(default=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['min_units']

    def __str__(self):
        return f"{self.get_slab_display()} @ Rs.{self.rate_per_unit}/unit"


class MeterReading(models.Model):
    """Monthly meter readings"""
    STATUS_CHOICES = [
        ('pending',   'Pending'),
        ('estimated', 'Estimated'),
        ('confirmed', 'Confirmed'),
    ]

    customer        = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='readings')
    reading_date    = models.DateField()
    previous_reading = models.DecimalField(max_digits=10, decimal_places=2)
    current_reading  = models.DecimalField(max_digits=10, decimal_places=2)
    units_consumed   = models.DecimalField(max_digits=10, decimal_places=2, editable=False)
    status           = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    reader_name      = models.CharField(max_length=100, blank=True)
    remarks          = models.TextField(blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-reading_date']

    def save(self, *args, **kwargs):
        self.units_consumed = self.current_reading - self.previous_reading
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.customer.name} | {self.reading_date} | {self.units_consumed} units"


class GasBill(models.Model):
    """Generated gas bills"""
    STATUS_CHOICES = [
        ('unpaid',    'Unpaid'),
        ('paid',      'Paid'),
        ('overdue',   'Overdue'),
        ('partial',   'Partial'),
        ('waived',    'Waived'),
    ]

    customer          = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='bills')
    meter_reading     = models.OneToOneField(MeterReading, on_delete=models.CASCADE, related_name='bill')
    tariff            = models.ForeignKey(GasTariff, on_delete=models.SET_NULL, null=True, related_name='bills')
    bill_number       = models.CharField(max_length=20, unique=True)
    billing_month     = models.DateField()
    due_date          = models.DateField()
    units_consumed    = models.DecimalField(max_digits=10, decimal_places=2)
    gas_charges       = models.DecimalField(max_digits=10, decimal_places=2)
    fixed_charges     = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    meter_rent        = models.DecimalField(max_digits=8,  decimal_places=2, default=0)
    gst_percent       = models.DecimalField(max_digits=5,  decimal_places=2, default=17.0)
    gst_amount        = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    previous_arrears  = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_amount      = models.DecimalField(max_digits=10, decimal_places=2)
    status            = models.CharField(max_length=10, choices=STATUS_CHOICES, default='unpaid')
    generated_by      = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    notes             = models.TextField(blank=True)
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-billing_month']

    def __str__(self):
        return f"Bill#{self.bill_number} - {self.customer.name} - Rs.{self.total_amount}"

    def calculate_totals(self):
        subtotal = self.gas_charges + self.fixed_charges + self.meter_rent
        self.gst_amount = round(subtotal * (self.gst_percent / 100), 2)
        self.total_amount = subtotal + self.gst_amount + self.previous_arrears
        return self.total_amount


class Payment(models.Model):
    """Bill payments"""
    PAYMENT_METHOD_CHOICES = [
        ('cash',          'Cash'),
        ('bank_transfer', 'Bank Transfer'),
        ('easypaisa',     'EasyPaisa'),
        ('jazzcash',      'JazzCash'),
        ('online',        'Online Portal'),
        ('cheque',        'Cheque'),
    ]
    STATUS_CHOICES = [
        ('pending',   'Pending'),
        ('completed', 'Completed'),
        ('failed',    'Failed'),
        ('refunded',  'Refunded'),
    ]

    bill             = models.ForeignKey(GasBill, on_delete=models.CASCADE, related_name='payments')
    payment_date     = models.DateField()
    amount           = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0.01)])
    payment_method   = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default='cash')
    transaction_id   = models.CharField(max_length=100, blank=True)
    received_by      = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    status           = models.CharField(max_length=10, choices=STATUS_CHOICES, default='completed')
    remarks          = models.TextField(blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-payment_date']

    def __str__(self):
        return f"Payment Rs.{self.amount} for Bill#{self.bill.bill_number}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Auto-update bill status
        bill = self.bill
        total_paid = sum(p.amount for p in bill.payments.filter(status='completed'))
        if total_paid >= bill.total_amount:
            bill.status = 'paid'
        elif total_paid > 0:
            bill.status = 'partial'
        bill.save()


class Complaint(models.Model):
    """Customer complaints"""
    CATEGORY_CHOICES = [
        ('billing',      'Billing Issue'),
        ('leakage',      'Gas Leakage'),
        ('pressure',     'Low Pressure'),
        ('meter',        'Meter Problem'),
        ('disconnection','Wrongful Disconnection'),
        ('other',        'Other'),
    ]
    PRIORITY_CHOICES = [
        ('low',      'Low'),
        ('medium',   'Medium'),
        ('high',     'High'),
        ('critical', 'Critical'),
    ]
    STATUS_CHOICES = [
        ('open',        'Open'),
        ('in_progress', 'In Progress'),
        ('resolved',    'Resolved'),
        ('closed',      'Closed'),
    ]

    customer     = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='complaints')
    category     = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    priority     = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    subject      = models.CharField(max_length=200)
    description  = models.TextField()
    status       = models.CharField(max_length=15, choices=STATUS_CHOICES, default='open')
    assigned_to  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_complaints')
    resolution   = models.TextField(blank=True)
    resolved_at  = models.DateTimeField(null=True, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"#{self.id} {self.subject} - {self.customer.name}"
