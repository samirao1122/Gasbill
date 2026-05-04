from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Customer, GasTariff, MeterReading, GasBill, Payment, Complaint


# ─── User ─────────────────────────────────────────────────────────────────────
class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model  = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'password', 'is_staff', 'date_joined']
        read_only_fields = ['is_staff', 'date_joined']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


# ─── Customer ─────────────────────────────────────────────────────────────────
class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Customer
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

class CustomerListSerializer(serializers.ModelSerializer):
    """Lighter serializer for list views"""
    class Meta:
        model  = Customer
        fields = ['id', 'name', 'cnic', 'phone', 'meter_number', 'meter_type', 'status', 'city']


# ─── Gas Tariff ───────────────────────────────────────────────────────────────
class GasTariffSerializer(serializers.ModelSerializer):
    class Meta:
        model  = GasTariff
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


# ─── Meter Reading ────────────────────────────────────────────────────────────
class MeterReadingSerializer(serializers.ModelSerializer):
    customer_name   = serializers.CharField(source='customer.name', read_only=True)
    meter_number    = serializers.CharField(source='customer.meter_number', read_only=True)

    class Meta:
        model  = MeterReading
        fields = '__all__'
        read_only_fields = ['units_consumed', 'created_at', 'updated_at']

    def validate(self, data):
        if data.get('current_reading', 0) < data.get('previous_reading', 0):
            raise serializers.ValidationError("Current reading cannot be less than previous reading.")
        return data


# ─── Gas Bill ─────────────────────────────────────────────────────────────────
class GasBillSerializer(serializers.ModelSerializer):
    customer_name   = serializers.CharField(source='customer.name',          read_only=True)
    meter_number    = serializers.CharField(source='customer.meter_number',   read_only=True)
    customer_address= serializers.CharField(source='customer.address',        read_only=True)
    customer_phone  = serializers.CharField(source='customer.phone',          read_only=True)
    tariff_info     = GasTariffSerializer(source='tariff',                    read_only=True)
    total_paid      = serializers.SerializerMethodField()
    balance_due     = serializers.SerializerMethodField()

    class Meta:
        model  = GasBill
        fields = '__all__'
        read_only_fields = ['bill_number', 'created_at', 'updated_at']

    def get_total_paid(self, obj):
        return sum(p.amount for p in obj.payments.filter(status='completed'))

    def get_balance_due(self, obj):
        paid = self.get_total_paid(obj)
        return float(obj.total_amount) - float(paid)

class GasBillCreateSerializer(serializers.ModelSerializer):
    """Used for creating/updating bills"""
    class Meta:
        model  = GasBill
        fields = '__all__'
        read_only_fields = ['bill_number', 'created_at', 'updated_at']

    def create(self, validated_data):
        # Auto-generate bill number
        import datetime, random
        month    = datetime.datetime.now().strftime('%Y%m')
        rand_num = random.randint(1000, 9999)
        validated_data['bill_number'] = f"GB-{month}-{rand_num}"
        return super().create(validated_data)


# ─── Payment ──────────────────────────────────────────────────────────────────
class PaymentSerializer(serializers.ModelSerializer):
    bill_number    = serializers.CharField(source='bill.bill_number',  read_only=True)
    customer_name  = serializers.CharField(source='bill.customer.name',read_only=True)

    class Meta:
        model  = Payment
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than 0.")
        return value


# ─── Complaint ────────────────────────────────────────────────────────────────
class ComplaintSerializer(serializers.ModelSerializer):
    customer_name  = serializers.CharField(source='customer.name',  read_only=True)
    assigned_name  = serializers.CharField(source='assigned_to.get_full_name', read_only=True)

    class Meta:
        model  = Complaint
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


# ─── Dashboard Stats ──────────────────────────────────────────────────────────
class DashboardSerializer(serializers.Serializer):
    total_customers      = serializers.IntegerField()
    active_customers     = serializers.IntegerField()
    total_bills          = serializers.IntegerField()
    unpaid_bills         = serializers.IntegerField()
    overdue_bills        = serializers.IntegerField()
    total_revenue        = serializers.DecimalField(max_digits=15, decimal_places=2)
    pending_complaints   = serializers.IntegerField()
    this_month_readings  = serializers.IntegerField()
