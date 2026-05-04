from django.contrib import admin
from .models import Customer, GasTariff, MeterReading, GasBill, Payment, Complaint


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display  = ['name', 'cnic', 'meter_number', 'meter_type', 'status', 'city', 'created_at']
    search_fields = ['name', 'cnic', 'meter_number', 'phone']
    list_filter   = ['status', 'meter_type', 'city']


@admin.register(GasTariff)
class GasTariffAdmin(admin.ModelAdmin):
    list_display = ['slab', 'min_units', 'max_units', 'rate_per_unit', 'fixed_charges', 'is_active']
    list_filter  = ['is_active']


@admin.register(MeterReading)
class MeterReadingAdmin(admin.ModelAdmin):
    list_display  = ['customer', 'reading_date', 'previous_reading', 'current_reading', 'units_consumed', 'status']
    search_fields = ['customer__name', 'customer__meter_number']
    list_filter   = ['status', 'reading_date']


@admin.register(GasBill)
class GasBillAdmin(admin.ModelAdmin):
    list_display  = ['bill_number', 'customer', 'billing_month', 'total_amount', 'status', 'due_date']
    search_fields = ['bill_number', 'customer__name']
    list_filter   = ['status', 'billing_month']


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display  = ['bill', 'payment_date', 'amount', 'payment_method', 'status']
    search_fields = ['bill__bill_number', 'transaction_id']
    list_filter   = ['payment_method', 'status']


@admin.register(Complaint)
class ComplaintAdmin(admin.ModelAdmin):
    list_display  = ['id', 'customer', 'category', 'priority', 'subject', 'status', 'created_at']
    search_fields = ['subject', 'customer__name']
    list_filter   = ['status', 'priority', 'category']
