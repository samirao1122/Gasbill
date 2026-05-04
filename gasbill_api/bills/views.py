from rest_framework import viewsets, status, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView, TokenVerifyView
from django.contrib.auth.models import User
from django.db.models import Sum, Count, Q
from django.utils import timezone
import datetime

from .models import Customer, GasTariff, MeterReading, GasBill, Payment, Complaint
from .serializers import (
    UserSerializer, CustomerSerializer, CustomerListSerializer,
    GasTariffSerializer, MeterReadingSerializer,
    GasBillSerializer, GasBillCreateSerializer,
    PaymentSerializer, ComplaintSerializer, DashboardSerializer
)


# ─── JWT Login View ───────────────────────────────────────────────────────────
class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]


class RefreshView(TokenRefreshView):
    permission_classes = [AllowAny]


class VerifyView(TokenVerifyView):
    permission_classes = [AllowAny]


# ─── User Registration ────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    serializer = UserSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        return Response({
            'message': 'User registered successfully.',
            'user': UserSerializer(user).data
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def my_profile(request):
    if request.method == 'GET':
        return Response(UserSerializer(request.user).data)
    serializer = UserSerializer(request.user, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─── Dashboard ────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard(request):
    today = timezone.now().date()
    this_month_start = today.replace(day=1)

    data = {
        'total_customers':     Customer.objects.count(),
        'active_customers':    Customer.objects.filter(status='active').count(),
        'total_bills':         GasBill.objects.count(),
        'unpaid_bills':        GasBill.objects.filter(status='unpaid').count(),
        'overdue_bills':       GasBill.objects.filter(status='overdue').count(),
        'total_revenue':       Payment.objects.filter(status='completed').aggregate(t=Sum('amount'))['t'] or 0,
        'pending_complaints':  Complaint.objects.filter(status__in=['open', 'in_progress']).count(),
        'this_month_readings': MeterReading.objects.filter(reading_date__gte=this_month_start).count(),
    }
    return Response(data)


# ─── Customer ViewSet ─────────────────────────────────────────────────────────
class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields   = ['name', 'cnic', 'meter_number', 'phone', 'city']
    ordering_fields = ['name', 'created_at', 'meter_number']

    def get_serializer_class(self):
        if self.action == 'list':
            return CustomerListSerializer
        return CustomerSerializer

    def destroy(self, request, *args, **kwargs):
        customer = self.get_object()
        customer.delete()
        return Response({'message': 'Customer deleted successfully.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='bills')
    def customer_bills(self, request, pk=None):
        customer = self.get_object()
        bills    = GasBill.objects.filter(customer=customer)
        serializer = GasBillSerializer(bills, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='readings')
    def customer_readings(self, request, pk=None):
        customer = self.get_object()
        readings = MeterReading.objects.filter(customer=customer)
        serializer = MeterReadingSerializer(readings, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='complaints')
    def customer_complaints(self, request, pk=None):
        customer   = self.get_object()
        complaints = Complaint.objects.filter(customer=customer)
        serializer = ComplaintSerializer(complaints, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['patch'], url_path='change-status')
    def change_status(self, request, pk=None):
        customer = self.get_object()
        new_status = request.data.get('status')
        allowed = [s[0] for s in Customer.STATUS_CHOICES]
        if new_status not in allowed:
            return Response({'error': f'Invalid status. Allowed: {allowed}'}, status=400)
        customer.status = new_status
        customer.save()
        return Response({'message': f'Status changed to {new_status}.'})


# ─── Gas Tariff ViewSet ───────────────────────────────────────────────────────
class GasTariffViewSet(viewsets.ModelViewSet):
    queryset = GasTariff.objects.all()
    serializer_class = GasTariffSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'], url_path='active')
    def active_tariffs(self, request):
        tariffs    = GasTariff.objects.filter(is_active=True)
        serializer = GasTariffSerializer(tariffs, many=True)
        return Response(serializer.data)


# ─── Meter Reading ViewSet ────────────────────────────────────────────────────
class MeterReadingViewSet(viewsets.ModelViewSet):
    queryset = MeterReading.objects.select_related('customer').all()
    serializer_class = MeterReadingSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields   = ['customer__name', 'customer__meter_number', 'status']
    ordering_fields = ['reading_date', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        customer_id = self.request.query_params.get('customer')
        month       = self.request.query_params.get('month')
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if month:
            try:
                d = datetime.datetime.strptime(month, '%Y-%m')
                qs = qs.filter(reading_date__year=d.year, reading_date__month=d.month)
            except ValueError:
                pass
        return qs

    @action(detail=True, methods=['post'], url_path='confirm')
    def confirm_reading(self, request, pk=None):
        reading = self.get_object()
        reading.status = 'confirmed'
        reading.save()
        return Response({'message': 'Reading confirmed.'})


# ─── Gas Bill ViewSet ─────────────────────────────────────────────────────────
class GasBillViewSet(viewsets.ModelViewSet):
    queryset = GasBill.objects.select_related('customer', 'tariff').all()
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields   = ['bill_number', 'customer__name', 'customer__meter_number', 'status']
    ordering_fields = ['billing_month', 'total_amount', 'due_date', 'created_at']

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return GasBillCreateSerializer
        return GasBillSerializer

    def get_queryset(self):
        qs          = super().get_queryset()
        status_f    = self.request.query_params.get('status')
        customer_id = self.request.query_params.get('customer')
        month       = self.request.query_params.get('month')
        if status_f:
            qs = qs.filter(status=status_f)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if month:
            try:
                d = datetime.datetime.strptime(month, '%Y-%m')
                qs = qs.filter(billing_month__year=d.year, billing_month__month=d.month)
            except ValueError:
                pass
        return qs

    def perform_create(self, serializer):
        serializer.save(generated_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        bill = self.get_object()
        bill.delete()
        return Response({'message': 'Bill deleted successfully.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['patch'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        bill = self.get_object()
        bill.status = 'paid'
        bill.save()
        return Response({'message': f'Bill #{bill.bill_number} marked as paid.'})

    @action(detail=True, methods=['patch'], url_path='mark-overdue')
    def mark_overdue(self, request, pk=None):
        bill = self.get_object()
        bill.status = 'overdue'
        bill.save()
        return Response({'message': f'Bill #{bill.bill_number} marked as overdue.'})

    @action(detail=True, methods=['get'], url_path='payments')
    def bill_payments(self, request, pk=None):
        bill = self.get_object()
        serializer = PaymentSerializer(bill.payments.all(), many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='overdue')
    def overdue_bills(self, request):
        today    = timezone.now().date()
        bills    = GasBill.objects.filter(due_date__lt=today, status__in=['unpaid', 'partial'])
        bills.update(status='overdue')
        serializer = GasBillSerializer(bills, many=True)
        return Response(serializer.data)


# ─── Payment ViewSet ──────────────────────────────────────────────────────────
class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.select_related('bill', 'bill__customer').all()
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields   = ['bill__bill_number', 'bill__customer__name', 'transaction_id', 'payment_method']
    ordering_fields = ['payment_date', 'amount', 'created_at']

    def get_queryset(self):
        qs      = super().get_queryset()
        bill_id = self.request.query_params.get('bill')
        method  = self.request.query_params.get('method')
        if bill_id:
            qs = qs.filter(bill_id=bill_id)
        if method:
            qs = qs.filter(payment_method=method)
        return qs

    def perform_create(self, serializer):
        serializer.save(received_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        payment = self.get_object()
        payment.delete()
        return Response({'message': 'Payment deleted successfully.'}, status=status.HTTP_200_OK)


# ─── Complaint ViewSet ────────────────────────────────────────────────────────
class ComplaintViewSet(viewsets.ModelViewSet):
    queryset = Complaint.objects.select_related('customer', 'assigned_to').all()
    serializer_class = ComplaintSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields   = ['subject', 'customer__name', 'category', 'status']
    ordering_fields = ['created_at', 'priority']

    def get_queryset(self):
        qs          = super().get_queryset()
        status_f    = self.request.query_params.get('status')
        priority    = self.request.query_params.get('priority')
        customer_id = self.request.query_params.get('customer')
        if status_f:
            qs = qs.filter(status=status_f)
        if priority:
            qs = qs.filter(priority=priority)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        return qs

    @action(detail=True, methods=['patch'], url_path='resolve')
    def resolve_complaint(self, request, pk=None):
        complaint = self.get_object()
        resolution = request.data.get('resolution', '')
        complaint.status      = 'resolved'
        complaint.resolution  = resolution
        complaint.resolved_at = timezone.now()
        complaint.save()
        return Response({'message': 'Complaint resolved successfully.'})

    @action(detail=True, methods=['patch'], url_path='assign')
    def assign_complaint(self, request, pk=None):
        complaint = self.get_object()
        user_id   = request.data.get('user_id')
        try:
            user = User.objects.get(id=user_id)
            complaint.assigned_to = user
            complaint.status      = 'in_progress'
            complaint.save()
            return Response({'message': f'Complaint assigned to {user.get_full_name() or user.username}.'})
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=404)
